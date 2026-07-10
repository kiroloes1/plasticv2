const Worker = require(`${__dirname}/../../models/workerModel`);
const TransactionModel=require(`${__dirname}/../../models/TransactionBox`);
const { getCashBox } = require(`${__dirname}/../../services/moneyBox`);
const mongoose = require("mongoose");
// 1. إضافة عامل (حماية ضد نقص البيانات)
exports.createWorker = async (req, res) => {
  try {
    const { name, dailySalary } = req.body;

    // حماية: التأكد من وجود البيانات الأساسية
    if (!name || !dailySalary) {
      return res.status(400).json({ message: "الرجاء إدخال الاسم وقيمة اليومية" });
    }

    const newWorker = await Worker.create({ 
      name: name.trim(), 
      dailySalary: Number(dailySalary) 
    });

    res.status(201).json({ message: "تم إضافة العامل بنجاح", worker: newWorker });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء الإنشاء", error: error.message });
  }
};


// 2. تسجيل حضور أو غياب (مع إمكانية تعديل الحالة)
exports.markAttendance = async (req, res) => {
  try {
    const { status, date } = req.body;

    // التحقق من الحالة
    if (!status || !["present", "absent"].includes(status)) {
      return res.status(400).json({
        message: "يجب تحديد الحالة (حاضر أم غائب)",
      });
    }

    // استخدام التاريخ المرسل أو تاريخ اليوم
    const attendanceDate = date ? new Date(date) : new Date();
    attendanceDate.setHours(0, 0, 0, 0);

    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    // البحث عن تسجيل لنفس اليوم
    const existingAttendance = worker.attendance.find((attendance) => {
      const d = new Date(attendance.date);
      d.setHours(0, 0, 0, 0);

      return d.getTime() === attendanceDate.getTime();
    });

    if (existingAttendance) {
      // تعديل الحالة فقط
      existingAttendance.status = status;
    } else {
      // إنشاء سجل جديد
      worker.attendance.push({
        date: attendanceDate,
        status,
      });
    }

    await worker.save();

    res.status(200).json({
      success: true,
      message:
        existingAttendance
          ? "تم تحديث حالة العامل بنجاح"
          : status === "present"
          ? "تم تسجيل الحضور"
          : "تم تسجيل الغياب",
      attendance: worker.attendance,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 3. إضافة (سلفة / خصم / أكل) - حماية ضد الأرقام السالبة الغلط
// 3. إضافة (سلفة / خصم / أكل)
exports.addFinancial = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { type, amount, note } = req.body;
    const userId = req.user.userId;

    // التحقق من البيانات
    if (!type || !amount || isNaN(amount)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "الرجاء إدخال نوع العملية والمبلغ بشكل صحيح",
      });
    }

    if (!["advance", "deduction", "food"].includes(type)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "نوع العملية غير مدعوم",
      });
    }

    const worker = await Worker.findById(req.params.id).session(session);

    if (!worker) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    const value = Math.abs(Number(amount));

    // إضافة العملية للعامل
    worker.financialRecords.push({
      type,
      amount: value,
      note: note || "",
      date: new Date(),
    });

    // السلفة والأكل فقط يخرجوا من الخزنة
    if (type === "advance" || type === "food") {
      const box = await getCashBox(userId, session);
      const itemsUpdate=[]

      itemsUpdate.push(            {
                title:    (type === "advance"
                ? `سلفة للعامل ${worker.name}+ `  + (note || "") 
                : `أكل للعامل ${worker.name}  + `) + (note || ""),
                category: "expense",
                amount: value,
            },)  
       
      await TransactionModel.create(
        [
          {
            moneyBoxId: box._id,
            type: "expense",
        
            // expenseType: type, // advance | food
            items: itemsUpdate || [],
            note:
              
              (type === "advance"
                ? `سلفة للعامل ${worker.name}+ `  + (note || "") 
                : `أكل للعامل ${worker.name}  + `) + (note || ""),

            workerId: worker._id,
            date: new Date(),
          },
        ],
        { session }
      );
    }

    await worker.save({ session });

    await session.commitTransaction();

    res.json({
      message:
        type === "advance"
          ? "تم تسجيل السلفة بنجاح"
          : type === "food"
          ? "تم تسجيل مصروف الأكل بنجاح"
          : "تم تسجيل الخصم بنجاح",
    });
  } catch (error) {
    await session.abortTransaction();

    res.status(500).json({
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

// 4. تصفية الحساب (المحاسبة) - حماية ضد العمليات الفارغة
exports.paySalary = async (req, res) => {
  try {
    const { paidAmount } = req.body; // المبلغ اللي المدير دفعه بإيده
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ message: "العامل غير موجود" });

    const presentDays = worker.attendance.filter(a => a.status === "present").length;
    const totalEarnings = presentDays * (worker.dailySalary || 0);
    const totalDeductions = worker.financialRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

    // 1. المستحق الحالي (يومية + رصيد قديم - خصومات)
    // لاحظ: الرصيد القديم لو مديونية بيبقى سالب أصلاً فبيطرح تلقائياً
    let currentDues = (totalEarnings + (worker.balance.amount || 0)) - totalDeductions;

    // 2. حساب الفرق (المستحق - المدفوع فعلياً)
    // لو currentDues 200 والمدفوع 100 -> يبقى 100 (رصيد موجب للعامل)
    // لو currentDues 200 والمدفوع 300 -> يبقى -100 (مديونية على العامل)
    let remainingBalance = currentDues - Number(paidAmount);

    // 3. تسجيل العملية في التاريخ
    worker.paymentHistory.push({
      date: new Date(),
      daysWorked: presentDays,
      totalDeductions,
      netPaid: Number(paidAmount), // سجلنا اللي اندفع فعلياً
      remainingBalance: remainingBalance // سجلنا المتبقي في العملية دي
    });

    // 4. تحديث الرصيد الجديد (المتبقي يصبح هو الرصيد القادم)
    worker.balance.amount = remainingBalance;
    worker.balance.notes = remainingBalance < 0 
      ? `مديونية متبقية بعد دفع ${paidAmount} ج.م` 
      : remainingBalance > 0 
      ? `رصيد متبقي للعامل بعد دفع ${paidAmount} ج.م` 
      : "تمت التصفية بالكامل";
    
    // 5. تصفير السجلات الحالية (الحضور والخصومات اليومية)
    worker.attendance = []; 
    worker.financialRecords = [];
    
    await worker.save();
    res.json({ 
      message: "تمت عملية الدفع بنجاح", 
      netAmount: paidAmount, 
      newBalance: remainingBalance 
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

// 5. تعديل الرصيد يدوياً
exports.updateBalance = async (req, res) => {
  try {
    const { amount, note } = req.body; 
    
    if (amount === undefined || isNaN(amount)) {
      return res.status(400).json({ message: "الرجاء إدخال مبلغ صحيح لتعديل الرصيد" });
    }

    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ message: "العامل غير موجود" });

    worker.balance.amount += Number(amount);
    worker.balance.notes = note || "تعديل يدوي";
    
    await worker.save();
    res.json({ message: "تم تحديث الرصيد", currentBalance: worker.balance.amount });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

// 6. جلب كل العمال (بيجيب الاسم، اليومية، والرصيد الحالي فقط للاختصار)
exports.getWorkers = async (req, res) => {
  try {
    const workers = await Worker.find();
    
    res.status(200).json({
      success: true,
      count: workers.length,
      workers
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب العمال", error: error.message });
  }
};



// 7. جلب بيانات عامل محدد (بالتفاصيل الكاملة: حضور، سلف، أرشيف)
exports.getWorkerById = async (req, res) => {
  try {
    const { id } = req.params;

    // حماية: التأكد إن الـ ID مبعوت وشكله صح قبل ما نكلم الداتابيز
    if (!id || id.length !== 24) {
      return res.status(400).json({ message: "كود العامل غير صحيح" });
    }

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({ message: "العامل غير موجود في السيستم" });
    }

    res.status(200).json({
      success: true,
      worker
    });
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات العامل", error: error.message });
  }
};

// Route: PUT /api/worker/:id
exports.updateWorker = async (req, res) => {
  try {
    const { name, dailySalary } = req.body;

    const updatedWorker = await Worker.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          name, 
          dailySalary: Number(dailySalary) 
        } 
      },
      { new: true, runValidators: true } // new عشان يرجع البيانات بعد التعديل
    );

    if (!updatedWorker) {
      return res.status(404).json({ success: false, message: "العامل غير موجود" });
    }

    res.status(200).json({
      success: true,
      message: "تم تحديث بيانات العامل بنجاح",
      worker: updatedWorker
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Route: DELETE /api/worker/:id
exports.deleteWorker = async (req, res) => {
  try {
    const worker = await Worker.findByIdAndDelete(req.params.id);

    if (!worker) {
      return res.status(404).json({ success: false, message: "العامل غير موجود بالفعل" });
    }

    res.status(200).json({
      success: true,
      message: `تم حذف العامل ${worker.name} بنجاح`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// تصفير شامل لكل سجلات العامل (بدون ترحيل)
exports.resetWorkerAccount = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ message: "العامل غير موجود" });

    // 1. تصفير الحضور
    worker.attendance = []; 
    
    // 2. تصفير السلف والخصومات
    worker.financialRecords = [];
    
    // 3. تصفير الرصيد المرحل تماماً
    worker.balance.amount = 0;
    worker.balance.notes = "تم تصفير الحساب يدوياً";

    // اختياري: لو عايز تمسح تاريخ المدفوعات القديم كمان (paymentHistory)
    // worker.paymentHistory = []; 

    await worker.save();
    
    res.json({ 
      success: true, 
      message: `تم تصفير حساب العامل ${worker.name} بنجاح وبدء سجل جديد` 
    });
  } catch (error) { 
    res.status(500).json({ message: "حدث خطأ أثناء التصفير", error: error.message }); 
  }
};


exports.getPayrollSummary = async (req, res) => {
  try {
    const workers = await Worker.find();

    let totalFactoryEarnings = 0;    // إجمالي اليوميات لكل العمال
    let totalFactoryDeductions = 0;  // إجمالي الخصومات/السلف المعلقة
    let totalPreviousBalances = 0;   // إجمالي الأرصدة المرحل (موجب وسالب)
    let totalNetToPay = 0;           // المبلغ النهائي المطلوب من الخزنة الآن
    let totalToPay = 0;           // المبلغ النهائي المطلوب دفعها  


    workers.forEach(worker => {
      const presentDays = worker.attendance?.filter(a => a.status === "present").length || 0;
      const totalEarnings = presentDays * (worker.dailySalary || 0);
      const totalDeductions = worker.financialRecords?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      const previousBalance = worker.balance?.amount || 0;

      const netSalary = (totalEarnings + previousBalance) - totalDeductions;

      totalToPay+=totalEarnings-totalDeductions

      // الجمع التراكمي للمصنع كله
      totalFactoryEarnings += totalEarnings;
      totalFactoryDeductions += totalDeductions;
      totalPreviousBalances += previousBalance;
      
      // نجمع فقط المبالغ "الموجبة" (التي تخرج من الخزنة) 
      // أو نجمع الصافي ككل لمعرفة وضع السيولة
      totalNetToPay += netSalary;
    });

    res.json({
      success: true,
      summary: {
        totalWorkers: workers.length,
        totalFactoryEarnings,      // إجمالي شغل العمال
        totalFactoryDeductions,    // إجمالي ما تم سحبه مقدماً
        totalPreviousBalances,     // صافي مديونيات العمال القديمة
        totalNetToPay  ,            // الرقم النهائي المطلوب توفيره في الخزنة
        totalToPay
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

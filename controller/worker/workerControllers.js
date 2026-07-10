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


// 3. إضافة (سلفة / خصم / أكل)
exports.addFinancial = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { type, amount, note ,date } = req.body;
    const userId = req.user.userId;

    const transactionDate = date ? new Date(date) : new Date();
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
      date: transactionDate || new Date(),
    });

    // السلفة والأكل فقط يخرجوا من الخزنة
    if (type === "advance" || type === "food") {
      const box = await getCashBox(userId, session);
      const itemsUpdate=[]

      itemsUpdate.push(            {
                title:    (type === "advance"
                ? `سلفة للعامل ${worker.name}   `   
                : `أكل للعامل ${worker.name}    `) ,
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
                ?  (note || `سلفة للعامل ${worker.name}   ` ) 
                : (note || `أكل للعامل ${worker.name}    `)),
            workerId: worker._id,
            date:transactionDate ||  new Date(),
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


// 4. تصفية الحساب (المحاسبة)
exports.paySalary = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { paidAmount, note } = req.body;
    const userId = req.user.userId;

    const worker = await Worker.findById(req.params.id).session(session);

    if (!worker) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    const presentDays = worker.attendance.filter(
      (a) => a.status === "present"
    ).length;

    const totalEarnings =
      presentDays * (worker.dailySalary || 0);

    const totalDeductions = worker.financialRecords.reduce(
      (sum, r) => sum + (r.amount || 0),
      0
    );

    // المستحق الحالي
    const currentDues =
      totalEarnings +
      (worker.balance.amount || 0) -
      totalDeductions;

    // الرصيد الجديد
    const remainingBalance =
      currentDues - Number(paidAmount);

    // سجل الدفع
    worker.paymentHistory.push({
      date: new Date(),
      daysWorked: presentDays,
      totalDeductions,
      netPaid: Number(paidAmount),
      remainingBalance,
    });

    // حركة الخزنة
    if (Number(paidAmount) !== 0) {
      const box = await getCashBox(userId, session);

      await TransactionModel.create(
        [
          {
            moneyBoxId: box._id,
            type: paidAmount > 0 ? "expense" : "income",
            items: [
              {
                title: paidAmount > 0
                  ? `دفع راتب للعامل ${worker.name}`
                  : `استرجاع مبلغ من العامل ${worker.name}`,
                category: paidAmount > 0 ? "workerOut" : "income",
                amount: Math.abs(Number(paidAmount)),
              },
            ],
            note:
              note ||
              (paidAmount > 0
                ? `دفع راتب للعامل ${worker.name}`
                : `استرجاع مبلغ من العامل ${worker.name}`),
            workerId: worker._id,
            date: new Date(),
          },
        ],
        { session }
      );
    }

    // تحديث الرصيد
    worker.balance.amount = remainingBalance;

    worker.balance.notes =
      remainingBalance < 0
        ? `مديونية متبقية بعد دفع ${paidAmount} ج.م`
        : remainingBalance > 0
        ? `رصيد متبقي للعامل بعد دفع ${paidAmount} ج.م`
        : "تمت التصفية بالكامل";

    // تصفير الدورة الحالية
    worker.attendance = [];
    worker.financialRecords = [];

    await worker.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "تمت عملية الدفع بنجاح",
      netAmount: Number(paidAmount),
      newBalance: remainingBalance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      message: error.message,
    });
  }
};


// 5. تعديل الرصيد يدوياً
exports.updateBalance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { amount, note } = req.body;
    const userId = req.user.userId;

    if (amount === undefined || isNaN(amount)) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        message: "الرجاء إدخال مبلغ صحيح لتعديل الرصيد",
      });
    }

    const worker = await Worker.findById(req.params.id).session(session);

    if (!worker) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    // تعديل الرصيد
    worker.balance.amount += Number(amount);
    worker.balance.notes = note || "تعديل يدوي";

    // إنشاء حركة في الخزنة
    if (Number(amount) !== 0) {
      const box = await getCashBox(userId, session);

      const itemsUpdate = [
        {
          title:
            amount > 0
              ? `تم سداد مبلغ مالي من العامل ${worker.name}`
              : `سلفة للعامل ${worker.name}`,
          category: amount > 0 ? "income" : "expense",
          amount: Math.abs(amount),
        },
      ];

      await TransactionModel.create(
        [
          {
            moneyBoxId: box._id,
            type: amount > 0 ? "income" : "expense",
            items: itemsUpdate,
            note:
              amount > 0
                ? note || `تم سداد مبلغ مالي من العامل ${worker.name}`
                : note || `سلفة للعامل ${worker.name}`,
            workerId: worker._id,
            date: new Date(),
          },
        ],
        { session }
      );
    }

    await worker.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "تم تحديث الرصيد",
      currentBalance: worker.balance.amount,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      message: error.message,
    });
  }
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
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const userId = req.user.userId;
    const { note } = req.body || { note: "تصفير شامل لحساب العامل" };

    const worker = await Worker.findById(req.params.id).session(session);

    if (!worker) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    // تصفير الحضور
    worker.attendance = [];

    // تصفير السلف والخصومات
    worker.financialRecords = [];

    // إذا كان يوجد رصيد مرحل
    if (worker.balance.amount != 0) {
      const box = await getCashBox(userId, session);

      const paidAmount = worker.balance.amount;

      await TransactionModel.create(
        [
          {
            moneyBoxId: box._id,
            type: paidAmount > 0 ? "expense" : "income",
            items: [
              {
                title:
                  paidAmount > 0
                    ? `تصفية رصيد العامل ${worker.name}`
                    : `استرجاع مبلغ من العامل ${worker.name}`,
                category: paidAmount > 0 ? "expense" : "income",
                amount: Math.abs(paidAmount),
              },
            ],
            note:
              note ||
              (paidAmount > 0
                ? `تصفية رصيد العامل ${worker.name}`
                : `استرجاع مبلغ من العامل ${worker.name}`),
            workerId: worker._id,
            date: new Date(),
          },
        ],
        { session }
      );
    }

    // تصفير الرصيد
    worker.balance.amount = 0;
    worker.balance.notes = "تم تصفير الحساب يدوياً";

    // لو عايز تمسح تاريخ المدفوعات
    // worker.paymentHistory = [];

    await worker.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `تم تصفير حساب العامل ${worker.name} بنجاح وبدء سجل جديد`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      message: "حدث خطأ أثناء التصفير",
      error: error.message,
    });
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


exports.editFinancial = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id, recordId } = req.params;
    const { type, amount, note , date } = req.body;
    const transactionDate = date ? new Date(date) : new Date();

    if (!["advance", "deduction", "food"].includes(type)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "نوع العملية غير صحيح",
      });
    }

    const worker = await Worker.findById(id).session(session);

    if (!worker) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    const record = worker.financialRecords.id(recordId);

    if (!record) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "السجل غير موجود",
      });
    }

    // حفظ البيانات القديمة
    const oldType = record.type;
    const oldAmount = record.amount;
    const oldDate = record.date;

    // البحث عن حركة الخزنة القديمة
    let transaction = null;

    if (oldType === "advance" || oldType === "food") {
      transaction = await TransactionModel.findOne({
        workerId: worker._id,
        type: "expense",
        "items.amount": oldAmount,
      }).session(session);
    }

    // تحديث السجل
    record.type = type;
    record.amount = Math.abs(Number(amount));
    record.note = note;
    record.date =transactionDate  || new Date();

    // ===========================
    // التعامل مع الخزنة
    // ===========================

    // لو القديم كان يخرج فلوس
    if (oldType === "advance" || oldType === "food") {

      // الجديد خصم => امسح الحركة
      if (type === "deduction") {

        if (transaction) {
          await transaction.deleteOne({ session });
        }

      } else {

        // تحديث الحركة
        if (transaction) {
          transaction.items[0].amount = Math.abs(Number(amount));

          transaction.items[0].title =
            type === "advance"
              ? `سلفة للعامل ${worker.name}`
              : `أكل للعامل ${worker.name}`;

          transaction.note =
            note ||
            (type === "advance"
              ? `سلفة للعامل ${worker.name}`
              : `أكل للعامل ${worker.name}`);

          transaction.date = transactionDate || new Date();

          await transaction.save({ session });
        }
      }
    }

    // القديم خصم والجديد سلفة أو أكل
    else if (
      oldType === "deduction" &&
      (type === "advance" || type === "food")
    ) {
      const userId = req.user.userId;
      const box = await getCashBox(userId, session);

      await TransactionModel.create(
        [
          {
            moneyBoxId: box._id,
            type: "expense",
            workerId: worker._id,
            items: [
              {
                title:
                  type === "advance"
                    ? `سلفة للعامل ${worker.name}`
                    : `أكل للعامل ${worker.name}`,
                category: "expense",
                amount: Math.abs(Number(amount)),
              },
            ],
            note:
              note ||
              (type === "advance"
                ? `سلفة للعامل ${worker.name}`
                : `أكل للعامل ${worker.name}`),
            date: transactionDate ||new Date(),
          },
        ],
        { session }
      );
    }

    await worker.save({ session });

    await session.commitTransaction();

    res.json({
      message: "تم تعديل العملية بنجاح",
    });
  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};


exports.deleteFinancial = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id, recordId } = req.params;

    const worker = await Worker.findById(id).session(session);

    if (!worker) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "العامل غير موجود",
      });
    }

    const record = worker.financialRecords.id(recordId);

    if (!record) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "السجل غير موجود",
      });
    }

    // لو العملية كانت سلفة أو أكل يبقى نحذف حركة الخزنة
    if (record.type === "advance" || record.type === "food") {
      const transaction = await TransactionModel.findOne({
        workerId: worker._id,
        "items.amount": record.amount,
        type: "expense"
       
      }).session(session);

      if (transaction) {
        await transaction.deleteOne({ session });
      }
    }

    // حذف السجل من العامل
    record.deleteOne();

    await worker.save({ session });

    await session.commitTransaction();

    res.json({
      message: "تم حذف العملية بنجاح",
    });
  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message,
    });
  } finally {
    session.endSession();
  }
};

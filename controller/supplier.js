const Supplier = require(`${__dirname}/../models/supplier`);
const mongoose = require("mongoose");
const { getCashBox } = require(`${__dirname}/../services/moneyBox`);
const Transaction = require(`${__dirname}/../models/TransactionBox`);
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const deliveryMoedl=require(`${__dirname}/../models/delivery`);
const returnDeliveryMoedl=require(`${__dirname}/../models/returnDelivery`);

// ================= GET ALL =================
exports.getAllSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success",
      data: suppliers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};


exports.getAllSupplierName = async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 },{_id:1,name:1});

    res.status(200).json({
      message: "Success",
      data: suppliers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};


exports.getAllSuppliersToDelivery = async (req, res) => {
  try {
    const suppliers = await Supplier.find({},{_id:1,name:1,remainingBalance:1}).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success",
      data: suppliers,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
};

// ================= GET BY ID =================
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id))
      return res.status(400).json({ message: "Invalid supplier ID" });

    const supplier = await Supplier.findById(id);

    if (!supplier)
      return res.status(404).json({ message: "Supplier not found" });

    res.status(200).json({
      message: "Success",
      data: supplier
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ================= CREATE =================
exports.createNewSupplier = async (req, res) => {
  try {
    const { name, phone, notes } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم التاجر مطلوب"
      });
    }
    if(!phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }

    const existSupplier = await Supplier.findOne({ name: name.trim() });

    if (existSupplier) {
      return res.status(409).json({
        message:  " اسم التاجر موجود بالفعل من فضلك غير اسمه "
      });
    }

    const newSupplier = await Supplier.create({
      name: name.trim(),
      phone: phone?.trim(),
      notes: notes?.trim()
    });

    res.status(201).json({
      message: "Supplier created successfully",
      data: newSupplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE =================
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id))
      return res.status(400).json({ message: "المعرف خطاء" });

    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "من فضلك املاء جميع الحقول"
      });
    }

    
    if (!updates.name || updates.name.trim().length < 2) {
      return res.status(400).json({
        message: "اسم التاجر مطلوب"
      });
    }
    if(!updates.phone){
       return res.status(400).json({
        message: "رقم الهاتف مطلوب"
      });
    }


    const supplier = await Supplier.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!supplier)
      return res.status(404).json({ message: "هذا التاجر غير موجود" });

    res.status(200).json({
      message: "تم تحديث بيانات التاجر بنجاح",
      data: supplier
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.deleteSupplier = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "المعرف خطأ" });
  }

  try {
    const supplier = await Supplier.findById(id);

    if (!supplier) {
      return res.status(404).json({ message: "هذا المورد غير موجود" });
    }

    await returnDeliveryMoedl.deleteMany({ supplier: id });
    await deliveryMoedl.deleteMany({ supplier: id });

    await Supplier.findByIdAndDelete(id);

    res.status(200).json({
      message: "تم حذف بيانات المورد بنجاح",
      data: supplier,
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

// ================= ADD DEBT =================
exports.addDebt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { amount, note,paymentMethod ,date } = req.body;
    const userId=req.user.userId;

    if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"bank" ,"work","mail"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }


    if (!isValidObjectId(id))
      return res.status(400).json({ message: "معرف غير صحيح" });

    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });


    const supplier = await Supplier.findById(id).session(session);

    if (!supplier)
      return res.status(404).json({ message: "التاجر غير موجود" });

   
    // supplier.remainingBalance += amount;
    supplier.remainingBalance = parseFloat((supplier.remainingBalance + amount).toFixed(2));

   
    supplier.paymentHistory.push({
      type: "debt",
      paymentMethod,
      amount,
      note: note?.trim(),
      date:date  || new Date()
    });

    await supplier.save({session});

    if (paymentMethod === "cash"){

        const box = await getCashBox(userId, session);

        await Transaction.create([{
            moneyBoxId: box._id,
            type: "income",
            note: note || "استلام فلوس نقدي من التاجر " + supplier.name,
            items: [{
                title: "استلام من التاجر " + supplier.name,
                category: "supplier",
                amount: Number(amount)
            }],
           supplierId: supplier._id,

           date:date|| new Date()
            
        }], { session });

    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم اضافه الدين بنجاح",
      remainingBalance: supplier.remainingBalance
    });

  } catch (err) {
      await session.abortTransaction();
      session.endSession();
    res.status(500).json({ message: "Server error",   error: err.message });
  }
};



// ================= PAY TO SUPPLIER =================
exports.paySupplier = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  try {
    
    const { id } = req.params;
    const { amount, note, paymentMethod, date } = req.body;
    const userId = req.user.userId;

        if (!paymentMethod || !["cash" , "wallet" ,"instapay" ,"bank" ,"work","mail"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "طريقة الدفع غير صحيحة"
      });
    }

    if (!isValidObjectId(id))
      return res.status(400).json({ message: "معرف غير صحيح" });

    if (!amount || amount <= 0)
      return res.status(400).json({ message: "المبلغ لازم يكون قيمه موجبه" });

    const supplier = await Supplier.findById(id).session(session);

    if (!supplier)
     return res.status(404).json({ message: "التاجر غير موجود" });

    
    // if (amount > supplier.remainingBalance) {
    //   return res.status(400).json({
    //     message: "المبلغ ا"
    //   });
    // }

    // reduce the remaining balance
    supplier.remainingBalance = parseFloat((supplier.remainingBalance - amount).toFixed(2));

    // add transaction
    supplier.paymentHistory.push({
      type: "payment",
          paymentMethod,
      amount,
      note: note?.trim(),
       date:date  || new Date()
    });

    await supplier.save({session});

    
if (paymentMethod === "cash") {

    const box = await getCashBox(userId, session);

    await Transaction.create([{
        moneyBoxId: box._id,
        type: "expense",
        note: note || "دفع فلوس نقدي للتاجر " + supplier.name,
        items: [{
            title: "دفع للتاجر " + supplier.name,
            category: "supplier",
            amount: Number(amount)
        }],
        supplierId: supplier._id,
        date:date  || new Date()
        
    }], { session });
}


    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: " تسديد المبلغ بنجاج",
      remainingBalance: supplier.remainingBalance
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: "Server error" ,err});
  }
};



// ================= FILTER =================
exports.filterSuppliers = async (req, res) => {
  try {
    const search = req.query.supplierSearch;

    if (!search || search.trim().length === 0) {
      return res.status(400).json({
        message: "من فضلك ادخل الsearch "
      });
    }

    const suppliers = await Supplier.find({
      name: { $regex: search.trim(), $options: "i" }
    });

    res.status(200).json({
      message: "تم بنجاح",
      data: suppliers
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deletePaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const { paymentId, supplierId } = req.params;

    const supplier = await Supplier.findById(supplierId).session(session);

    if (!supplier) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "التاجر غير موجود"
      });
    }

    const existPaymentHistory = supplier.paymentHistory.find(
      e => e._id.toString() === paymentId
    );

    if (!existPaymentHistory) {

      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العملية غير موجودة"
      });
    }

    if (existPaymentHistory.type === "payment") {

      supplier.remainingBalance = parseFloat(
        (supplier.remainingBalance + existPaymentHistory.amount).toFixed(2)
      );

    } else {

      supplier.remainingBalance = parseFloat(
        (supplier.remainingBalance - existPaymentHistory.amount).toFixed(2)
      );
    }

    // delete transaction if cash
    if (existPaymentHistory.paymentMethod === "cash") {

      await Transaction.findOneAndDelete({
        supplierId: supplier._id,
        totalAmount: existPaymentHistory.amount,
        type:
          existPaymentHistory.type === "payment"
            ? "expense"
            : "income"
      }).session(session);

    }

    supplier.paymentHistory = supplier.paymentHistory.filter(
      e => e._id.toString() !== paymentId
    );

    await supplier.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "تم حذف العملية بنجاح",
      remainingBalance: supplier.remainingBalance
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};


// edit payment history
exports.editPaymentHistory = async (req, res) => {
  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const { supplierId, paymentId } = req.params;

    const {
      amount,
      paymentMethod,
      type,
      note,
      date
    } = req.body;

    const supplier = await Supplier.findById(supplierId).session(session);

    if (!supplier) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "التاجر غير موجود"
      });
    }

    const payment = supplier.paymentHistory.id(paymentId);

    if (!payment) {

      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        message: "العملية غير موجودة"
      });

    }

    // ------------------------
    // رجع تأثير العملية القديمة
    // ------------------------

    if (payment.type === "payment") {

      supplier.remainingBalance += payment.amount;

    } else {

      supplier.remainingBalance -= payment.amount;

    }

    // ------------------------
    // لو Cash احذف الـ Transaction القديمة
    // ------------------------

    if (payment.paymentMethod === "cash") {

      await Transaction.findOneAndDelete({
        supplierId: supplier._id,
        totalAmount: payment.amount,
        type: payment.type === "payment"
          ? "expense"
          : "income"
      }).session(session);

    }

    // ------------------------
    // تعديل البيانات
    // ------------------------

    payment.amount = amount;
    payment.paymentMethod = paymentMethod;
    payment.type = type;
    payment.note = note;
    payment.date = date;

    // ------------------------
    // طبق تأثير العملية الجديدة
    // ------------------------

    if (payment.type === "payment") {

      supplier.remainingBalance -= payment.amount;

    } else {

      supplier.remainingBalance += payment.amount;

    }

    supplier.remainingBalance = Number(
      supplier.remainingBalance.toFixed(2)
    );

    // ------------------------
    // أنشئ Transaction جديدة لو Cash
    // ------------------------

    if (payment.paymentMethod === "cash") {

      await Transaction.create([{

        supplierId: supplier._id,

        totalAmount: payment.amount,

        type: payment.type === "payment"
          ? "expense"
          : "income",

        paymentMethod: "cash",

        note: payment.note,

        date: payment.date

      }], { session });

    }

    await supplier.save({ session });

    await session.commitTransaction();

    session.endSession();

    res.status(200).json({

      message: "تم تعديل العملية بنجاح",

      payment,

      remainingBalance: supplier.remainingBalance

    });

  } catch (err) {

    await session.abortTransaction();

    session.endSession();

    res.status(500).json({

      message: "Server error",

      error: err.message

    });

  }

};

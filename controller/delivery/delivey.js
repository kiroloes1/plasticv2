const derliveryModel = require(`${__dirname}/../../models/delivery`);
const Supplier = require(`${__dirname}/../../models/supplier`);
const Admin = require(`${__dirname}/../../models/users`);
const Item = require(`${__dirname}/../../models/fixedCategoryModel`);
const TransactionModel=require(`${__dirname}/../../models/TransactionBox`);
const { getCashBox } = require(`${__dirname}/../../services/moneyBox`);
const mongoose = require('mongoose');
const deliveryReturnMoedl=require(`${__dirname}/../../models/returnDelivery`)






// create delivery
exports.createDelivery = async (req, res) => {
    const adminId = req.user.userId; 
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);
        const {
            supplier,
            deliveryDate,
            items,
            teaForWorkers = 0,
            carPayment = 0,
            notes,
            note,  // to money box
           payment 
        } = req.body;

        const userId=req.user.userId;

        const payments = Array.isArray(payment) ? payment : [];
      
        for (const p of payments) {
            if (!p.paymentMethod  || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        if (!supplier || !items || items.length === 0) {
            throw new Error("المورد والصنف مطلوبين");
        }

        const supplierExists = await Supplier.findById(supplier).session(session);
        if (!supplierExists) throw new Error("المورد غير موجود");

        const adminExists = await Admin.findById(adminId).session(session);
        if (!adminExists) throw new Error("المستلم غير موجود");

        const lastDelivery = await derliveryModel
        .findOne({
            deliveryDate: { $gte: today, $lte: tomorrow }
        })
        .sort({ delveryNumber: -1 })
        .session(session);

        const deliveryNumber = lastDelivery
        ? lastDelivery.delveryNumber + 1
        : 1;
        let totalAmount = 0;

        for (const item of items) {

            const itemExists = await Item.findById(item.item).session(session);
            if (!itemExists) throw new Error("الصنف غير موجود");

           
            let itemTotalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                itemTotalWeight += batch.weight * batch.quantity;
            }

        
            const returnWeight = item.returnWeight + item.oldReturnWeight  || 0;

            if (returnWeight > itemTotalWeight) {
                throw new Error("المرتجع أكبر من الوزن");
            }

            
            const netWeight = itemTotalWeight - returnWeight;

           
            const grossPrice = netWeight * item.pricePerKg;

         
            const discountAmount = grossPrice * (item.discount || 0) / 100;

          
            const finalItemPrice = grossPrice - discountAmount;

            
            const returnAmount = returnWeight * item.pricePerKg;

       
            item.totalWeight = itemTotalWeight;
            item.netWeight = netWeight;
            item.totalPrice = finalItemPrice;
            item.totalReturnPrice = returnAmount;

            totalAmount += finalItemPrice;
        }

        
        totalAmount -= teaForWorkers;
        // totalAmount += carPayment;

     

        const paidAmount = payments.reduce((acc, curr) => {
            return acc + (curr.paidAmount || 0);
        }, 0);

        const oldBalance = supplierExists.remainingBalance || 0;
        const netDue = totalAmount - paidAmount;
        const newBalance = oldBalance + netDue;

        
        const delivery = await derliveryModel.create([{
            delveryNumber:deliveryNumber,
            supplier,
            deliveryDate,
            receivedBy: adminId,
            items,
            payment,
            totalAmount,
            oldBalance,
            teaForWorkers,
            carPayment,
            notes,  // to delivery
            paidAmount,
            remainingAmount: totalAmount - paidAmount
        }], { session });

       
        supplierExists.remainingBalance = newBalance;

      
        supplierExists.transactions.push({
            type:"delivery",
            deliveryId: delivery[0]._id || delivery?._id || null,
            totalAmount,
            paid: paidAmount,
            remainingBalance: newBalance,
            note: "New delivery",
            payment,
            date: deliveryDate || new Date()
        });

        await supplierExists.save({ session });


 
        const itemsUpdate=[]

        for (const p of payments){
            if(p.paymentMethod === "cash"){

             
             itemsUpdate.push(            {
                title:   " دفع فلوس للتاجر نقدي بدون نولون وشاي " + "  "+ supplierExists.name,
                category: "delivery",
                amount: Number(p.paidAmount)
            },)   


            }
        }

        itemsUpdate.push(  
            {
                title:   " دفع فلوس شاي نقدي " +"  "+ supplierExists.name,
                category: "teaForWorker",
                amount: Number(teaForWorkers)
            },
            {
                title:   " دفع فلوس نولون نقدي " +"  "+ supplierExists.name,
                category: "carPayment",
                amount: Number(carPayment)
            },)

        const box = await getCashBox(userId, session);
          await TransactionModel.create([{
            moneyBoxId: box._id,
            type: "expense",
            note: note || "  دفع فلوس للتاجر نقدي  " +"  "+ supplierExists.name,
            items: itemsUpdate || [],
           supplierId: supplierExists._id,
           deliverId: delivery[0]._id,
           date: deliveryDate || new Date()
            
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "تم إنشاء النقلة بنجاح",
            delivery: delivery[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};


// update delivery
exports.updateDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const adminId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

        const {
            supplier,
            deliveryDate,
            items,
            teaForWorkers = 0,
            carPayment = 0,
            payment = [],
            notes,
            note
        } = req.body;

        const payments = Array.isArray(payment) ? payment : [];

        // validate payments (same as create)
        for (const p of payments) {
            if (!p.paymentMethod || p.paidAmount == null || p.paidAmount < 0) {
                throw new Error("بيانات الدفع غير صحيحة");
            }
        }

        const oldDelivery = await derliveryModel.findById(id).session(session);
        if (!oldDelivery) throw new Error("النقلة غير موجودة");

        const supplierDoc = await Supplier.findById(oldDelivery.supplier).session(session);
        if (!supplierDoc) throw new Error("المورد غير موجود");

  
        // 1. ROLLBACK OLD EFFECT
  
        const oldPaid = oldDelivery.paidAmount || 0;
        const oldNet = (oldDelivery.totalAmount || 0) - oldPaid;

        supplierDoc.remainingBalance -= oldNet;

        supplierDoc.transactions = supplierDoc.transactions.filter(
            t => t.deliveryId?.toString() !== id
        );

  
        // 2. RECALCULATE ITEMS (same as create)
  
        let totalAmount = 0;

        for (const item of items) {

            const itemExists = await Item.findById(item.item).session(session);
            if (!itemExists) throw new Error("الصنف غير موجود");

            let itemTotalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                itemTotalWeight += batch.weight * batch.quantity;
            }

            const returnWeight = item.returnWeight  + item.oldReturnWeight || 0;

            if (returnWeight > itemTotalWeight) {
                throw new Error("المرتجع أكبر من الوزن");
            }

            const netWeight = itemTotalWeight - returnWeight;
            const grossPrice = netWeight * item.pricePerKg;
            const discountAmount = grossPrice * (item.discount || 0) / 100;
            const finalPrice = grossPrice - discountAmount;

            item.totalWeight = itemTotalWeight;
            item.netWeight = netWeight;
            item.totalPrice = finalPrice;
            item.totalReturnPrice = returnWeight * item.pricePerKg;

            totalAmount += finalPrice;
        }

        totalAmount -= teaForWorkers;
        // totalAmount += carPayment;

  
        // 3. PAYMENT CALCULATION
  
        const paidAmount = payments.reduce((acc, p) => {
            return acc + (p.paidAmount || 0);
        }, 0);

        const netDue = totalAmount - paidAmount;

  
        // 4. APPLY NEW EFFECT
  
        const newBalance = supplierDoc.remainingBalance + netDue;

        supplierDoc.remainingBalance = newBalance;

        supplierDoc.transactions.push({
            type: "delivery",
            deliveryId: id,
            totalAmount,
            paid: paidAmount,
            remainingBalance: newBalance,
            note:notes ||"Updated delivery",
            date:deliveryDate || new Date()
        });

        await supplierDoc.save({ session });

  
        // 5. UPDATE DELIVERY
  
        const updated = await derliveryModel.findByIdAndUpdate(
            id,
            {
                supplier: oldDelivery.supplier,
                deliveryDate,
                items,
                payment: payments,
                totalAmount,
                teaForWorkers,
                carPayment,
                notes,
                paidAmount,
                remainingAmount: netDue,
                receivedBy: adminId
            },
            { new: true, session }
        );

        await TransactionModel.deleteMany({
            deliverId: id,
            type: "expense"
        }).session(session);
        const itemsUpdate=[]

        for (const p of payments){
            if(p.paymentMethod === "cash"){

             
             itemsUpdate.push(            {
                title:   " دفع فلوس للتاجر نقدي بدون نولون وشاي " + "  "+ supplierDoc.name,
                category: "delivery",
                amount: Number(p.paidAmount)
            },)   


            }
        }

        itemsUpdate.push(  
            {
                title:   " دفع فلوس شاي نقدي" + "  "+ supplierDoc.name,
                category: "teaForWorker",
                amount: Number(teaForWorkers)
            },
            {
                title:   " دفع فلوس نولون نقدي" + "  "+ supplierDoc.name,
                category: "carPayment",
                amount: Number(carPayment)
            },)

        const box = await getCashBox(adminId, session);
          await TransactionModel.create([{
            moneyBoxId: box._id,
            type: "expense",
            note: note || "  دفع فلوس للتاجر نقدي  " + "  "+ supplierDoc.name,
            items: itemsUpdate || [],
           supplierId: supplierDoc._id,
           deliverId: updated._id,
             date: deliveryDate || new Date()
            
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم تعديل النقلة بنجاح",
            delivery: updated
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};


// delete delivery
exports.deleteDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("ID غير صحيح");
        }

  
        // 1. GET OLD DELIVERY
  
        const oldDelivery = await derliveryModel.findById(id).session(session);
        if (!oldDelivery) throw new Error("النقلة غير موجودة");

        const supplier = await Supplier.findById(oldDelivery.supplier).session(session);
        if (!supplier) throw new Error("المورد غير موجود");

  
        // 2. ROLLBACK SUPPLIER
  
        const oldPaid = oldDelivery.paidAmount || 0;
        const oldNet = (oldDelivery.totalAmount || 0) - oldPaid;

        supplier.remainingBalance -= oldNet;

        supplier.transactions = supplier.transactions.filter(
            t => t.deliveryId && t.deliveryId.toString() !== id
        );

        await supplier.save({ session });

  
        // 3. DELETE CASH TRANSACTIONS
  
        await TransactionModel.deleteMany({
            deliverId: id,
            type: "expense"
        }).session(session);

  
        // 4. DELETE DELIVERY
  
        await derliveryModel.findByIdAndDelete(id, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "تم حذف النقلة بنجاح"
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        res.status(500).json({ message: err.message });
    }
};


// get all deliveries
exports.getAllDeliveries = async (req, res) => {
    try {
        // pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // filters (optional)
        const { supplier, fromDate, toDate } = req.query;

        let filter = {};

        if (supplier && mongoose.Types.ObjectId.isValid(supplier)) {
            filter.supplier = supplier;
        }

        if (fromDate || toDate) {
            filter.deliveryDate = {};
            if (fromDate) filter.deliveryDate.$gte = new Date(fromDate);
            if (toDate) filter.deliveryDate.$lte = new Date(toDate);
        }

        // query
        const deliveries = await derliveryModel.find(filter,{_id:1, delveryNumber:1 ,supplier:1,totalAmount:1,deliveryDate:1})
            .populate("supplier", "name")
            .sort({ deliveryDate: -1 })




        const total = await derliveryModel.countDocuments(filter);


        res.status(200).json({
            page,
            results: deliveries.length,
            total,
            totalPages: Math.ceil(total / limit),
            deliveries
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// get delivery by id
exports.getDeliveryById = async (req, res) => {
    const { id } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "ID غير صحيح" });
        }
        const delivery = await derliveryModel.findById(id
        ).populate("supplier", "name")
        .populate("receivedBy", "username email")
        .populate("items.item", "name")
        .lean();

        if (!delivery) {
            return res.status(404).json({ message: "النقلة غير موجودة" });
        }
        res.status(200).json({ delivery });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}


exports.getDeliveryBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            return res.status(400).json({ message: "ID غير صحيح" });
        }

        // pagination
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const skip = (page - 1) * limit;

        // filters
        const {
            fromDate,
            toDate,
            minAmount,
            maxAmount,
            hasRemaining,
            paymentMethod
        } = req.query;

        let filter = { supplier: supplierId  };

        // date filter
        if (fromDate || toDate) {
            filter.deliveryDate = {};
            if (fromDate) filter.deliveryDate.$gte = new Date(fromDate);
            if (toDate) filter.deliveryDate.$lte = new Date(toDate);
        }

        // amount filter
        if (minAmount || maxAmount) {
            filter.totalAmount = {};
            if (minAmount) filter.totalAmount.$gte = Number(minAmount);
            if (maxAmount) filter.totalAmount.$lte = Number(maxAmount);
        }

        // remaining filter
        if (hasRemaining === "true") {
            filter.remainingAmount = { $gt: 0 };
        } else if (hasRemaining === "false") {
            filter.remainingAmount = 0;
        }

        // payment method filter (array field)
        if (paymentMethod) {
            filter["payment.paymentMethod"] = paymentMethod;
        }

        // query
        const deliverie = await derliveryModel.find(filter)
            .populate("supplier", "name remainingBalance")
            .populate("receivedBy", "username email")
            .populate("items.item", "name")
            .sort({ deliveryDate: -1 })
            .lean();

        const returnDelivery=await deliveryReturnMoedl.find(filter)  
             .populate("supplier", "name remainingBalance")
            .populate("receivedBy", "username email")
            .populate("items.item", "name")
            .sort({ deliveryDate: -1 })
            .lean(); 

            const deliveries=[
                ...deliverie,
                ...returnDelivery
            ]

        const total = await derliveryModel.countDocuments(filter);

        res.status(200).json({
            page,
            results: deliveries.length,
            total,
            totalPages: Math.ceil(total / limit),
            deliveries
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// get all deliveries
exports.getAllDeliveriesless = async (req, res) => {
    try {

        const deliveries = await derliveryModel.find()
            .populate("supplier", "name")
            .sort({ deliveryDate: -1 });

        const deliveryless = deliveries.filter(e => e.supplier == null);
        const total = deliveryless.length;

        res.status(200).json({
            deliveryless,
            total
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// delete delivery
exports.deleteDeliveryless = async (req, res) => {
    try {
        const { id } = req.params;

        const delivery = await derliveryModel.findByIdAndDelete(id);

        if (!delivery) {
            return res.status(404).json({
                message: "Delivery not found"
            });
        }

        res.status(200).json({
            message: "Delivery deleted successfully"
        });

    } catch (err) {
        res.status(500).json({
            message: err.message
        });
    }
};

exports.migratePayments = async (req, res) => {
  try {
    const deliveries = await derliveryModel.find({
      $or: [
        { payment: { $exists: false } },
        { payment: { $size: 0 } }
      ]
    });

    for (const delivery of deliveries) {
      if (delivery.paidAmount > 0) {
        delivery.payment = [
          {
            paidAmount: delivery.paidAmount,
            paymentMethod: "cash",
          },
        ];
      } else {
        delivery.payment = [];
      }

      await delivery.save();
    }

    res.json({
      message: "Migration completed",
      updated: deliveries.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

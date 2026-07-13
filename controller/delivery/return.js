const ReturnDelivery = require(`${__dirname}/../../models/returnDelivery`);
const Supplier = require(`${__dirname}/../../models/supplier`);
const Admin = require(`${__dirname}/../../models/users`);
const Item = require(`${__dirname}/../../models/fixedCategoryModel`);
const TransactionModel=require(`${__dirname}/../../models/TransactionBox`);
const mongoose = require('mongoose');

// create
exports.createReturnDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
                const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date();
        tomorrow.setHours(23, 59, 59, 999);

        const { supplier, items, notes ,deliveryDate } = req.body;
        const adminId = req.user.userId;

        if (!supplier || !items?.length) {
            throw new Error("المورد والأصناف مطلوبين");
        }

        const supplierDoc = await Supplier.findById(supplier).session(session);
        if (!supplierDoc) throw new Error("المورد غير موجود");


                const lastDelivery = await ReturnDelivery
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

            let totalWeight = 0;

            for (const batch of item.batches) {
                if (batch.weight < 0 || batch.quantity <= 0) {
                    throw new Error("Invalid batch data");
                }
                totalWeight += batch.weight * batch.quantity;
            }

            const totalPrice = totalWeight * item.pricePerKg;

            item.totalReturnWeight = totalWeight;
            item.totalReturnPrice = totalPrice;

            totalAmount += totalPrice;
        }

        const returnDelivery = await ReturnDelivery.create([{
            delveryNumber:deliveryNumber,
            supplier,
            receivedBy: adminId,
            items,
            notes,
            totalAmount,
            oldBalance:supplierDoc.remainingBalance
        }], { session });

        supplierDoc.remainingBalance -= totalAmount;

        supplierDoc.transactions.push({
            type: "return",
            deliveryId: returnDelivery[0]._id,
            totalAmount,
            paid: 0,
            remainingBalance: supplierDoc.remainingBalance,
            note: "Return delivery",
            date: deliveryDate ||  new Date()
        });

        await supplierDoc.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "تم إنشاء المرتجع بنجاح",
            data: returnDelivery[0]
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};
// update
exports.updateReturnDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { items, notes,deliveryDate } = req.body;
        const adminId = req.user.userId;

        const oldReturn = await ReturnDelivery.findById(id).session(session);
        if (!oldReturn) throw new Error("غير موجود");

        const supplier = await Supplier.findById(oldReturn.supplier).session(session);

        // ======================
        // rollback القديم
        // ======================
        supplier.remainingBalance += oldReturn.totalAmount || 0;

        supplier.transactions = supplier.transactions.filter(
            t => !(t.type === "return" && t.deliveryId?.toString() === id)
        );

        // ======================
        // حساب الجديد
        // ======================
        let newTotal = 0;

        for (const item of items) {

            let totalWeight = 0;

            for (const batch of item.batches) {
                totalWeight += batch.weight * batch.quantity;
            }

            const totalPrice = totalWeight * item.pricePerKg;

            item.totalReturnWeight = totalWeight;
            item.totalReturnPrice = totalPrice;

            newTotal += totalPrice;
        }

        // ======================
        // apply الجديد
        // ======================
        supplier.remainingBalance -= newTotal;

        supplier.transactions.push({
            type: "return",
            deliveryId: id,
            totalAmount: newTotal,
            remainingBalance: supplier.remainingBalance,
            note: "Updated return",
            date: deliveryDate || new Date()
        });

        await supplier.save({ session });

        const updated = await ReturnDelivery.findByIdAndUpdate(
            id,
            {
                items,
                notes,
                totalAmount: newTotal
            },
            { new: true, session }
        );

        await session.commitTransaction();
        session.endSession();

        res.json({
            message: "تم التعديل بنجاح",
            data: updated
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};

// delete
exports.deleteReturnDelivery = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        const oldReturn = await ReturnDelivery.findById(id).session(session);
        if (!oldReturn) throw new Error("غير موجود");

        const supplier = await Supplier.findById(oldReturn.supplier).session(session);

        supplier.remainingBalance += oldReturn.totalAmount || 0;

        supplier.transactions = supplier.transactions.filter(
            t => !(t.type === "return" && t.deliveryId?.toString() === id)
        );

        await supplier.save({ session });

        await ReturnDelivery.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        session.endSession();

        res.json({ message: "تم الحذف بنجاح" });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};

// get all
exports.getAllReturnDeliveries = async (req, res) => {
    try {
        const data = await ReturnDelivery.find()
            .populate("supplier", "name")
            .populate("receivedBy", "username")
            .populate("items.item", "name")
            .sort({ deliveryDate: -1 });

        res.json({
            results: data.length,
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// get all
exports.getAllReturnDeliveriesALL = async (req, res) => {
    try {
        const data = await ReturnDelivery.find({},{delveryNumber:1,deliveryDate:1,_id:1 ,supplier:1,deliveryDate:1})
            .populate("supplier", "name")
            .sort({ deliveryDate: -1 });

        res.json({
            results: data.length,
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};



// getReturnById
exports.getReturnById = async (req, res) => {
    try {
        const { id } = req.params;

        const data = await ReturnDelivery.findById(id)
            .populate("supplier", "name remainingBalance")
            .populate("receivedBy", "username")
            .populate("items.item", "name");

        if (!data) return res.status(404).json({ message: "غير موجود" });

        res.json({ data });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


//  getReturnBySupplier
exports.getReturnBySupplier = async (req, res) => {
    try {
        const { supplierId } = req.params;

        const data = await ReturnDelivery.find({ supplier: supplierId })
            .populate("supplier", "name")
            .populate("receivedBy", "username")
            .populate("items.item", "name")
            .sort({ deliveryDate: -1 });

        res.json({
            results: data.length,
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

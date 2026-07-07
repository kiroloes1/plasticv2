const MoneyBox= require(`${__dirname}/../../models/moneyBox`);
const mongoose = require("mongoose");
const Transaction = require(`${__dirname}/../../models/TransactionBox`);
const { getCashBox } = require(`${__dirname}/../../services/moneyBox`);

// add transaction to money box
exports.addTransaction = async (req, res) => {
    try {
        const { type, note, items } = req.body;
        const userId = req.user.userId;

        if (!type || !["income", "expense"].includes(type)) {
            return res.status(400).json({ message: "type invalid" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "items required" });
        }

        const box = await getCashBox(userId);

        const transaction = await Transaction.create({
            moneyBoxId: box._id,
            type,
            note: note?.trim(),
            items
        });

        return res.status(200).json({
            message: "تم إضافة العملية بنجاح",
            transaction
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// get Balance
exports.getBalance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const box = await getCashBox(userId);

        const result = await Transaction.aggregate([
            // { $match: { moneyBoxId: box._id } },
            {
                $project: {
                    type: 1,
                    items: 1,
                    total: {
                        $sum: "$items.amount"
                    }
                }
            },
            {
                $group: {
                    _id: "$type",
                    total: { $sum: "$total" }
                }
            }
        ]);

        let income = 0;
        let expense = 0;

        result.forEach(r => {
            if (r._id === "income") income = r.total;
            else expense = r.total;
        });

        return res.status(200).json({
            income,
            expense,
            balance: income - expense
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};


// new get transaction
exports.getTransactions2 = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { type, from, to } = req.query;

        const box = await getCashBox(userId);

      
        let filter = {
            moneyBoxId: box._id, 
            totalAmount: { $gt: 0 }
        };

        if (type) filter.type = type;

        if (from || to) {
            filter.date = {};
            if (from) filter.date.$gte = new Date(from);
            if (to) filter.date.$lte = new Date(to);
        }

       
        const transactions = await Transaction.find(filter)
            .sort({ date: -1 })
            .lean();


        let openingBalance = 0;

        if (from) {
            const previousSummary = await Transaction.aggregate([
                {
                    $match: {
                        moneyBoxId: box._id,
                        date: { $lt: new Date(from) } 
                    }
                },
                {
                    $group: {
                        _id: "$type",
                        total: { $sum: "$totalAmount" }
                    }
                }
            ]);

            let prevIncome = 0;
            let prevExpense = 0;

            previousSummary.forEach(r => {
                if (r._id === "income") prevIncome = r.total;
                if (r._id === "expense") prevExpense = r.total;
            });

            openingBalance = prevIncome - prevExpense;
        }



        let periodIncome = 0;
        let periodExpense = 0;

        transactions.forEach(t => {
            if (t.type === "income") periodIncome += t.totalAmount;
            if (t.type === "expense") periodExpense += t.totalAmount;
        });


 
        return res.status(200).json({
            count: transactions.length,
            openingBalance,                               
            periodIncome,                                 
            periodExpense,                                
            closingBalance: openingBalance + (periodIncome - periodExpense),
            transactions                                
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};
// get transactions
exports.getTransactions = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { type, from, to } = req.query;

        const box = await getCashBox(userId);

        // moneyBoxId: box._id
        let filter = {
            totalAmount: { $gt: 0 }
        };

        if (type) filter.type = type;

        if (from || to) {
            filter.date = {};
            if (from) filter.date.$gte = new Date(from);
            if (to) filter.date.$lte = new Date(to);
        }

        const transactions = await Transaction.find(filter,{type:1 ,totalAmount:1 ,date:1 })
            .sort({ date: -1 })
            .lean();

        return res.status(200).json({
            count: transactions.length,
            transactions
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// get transaction by id
exports.getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // get user's cash box
        const box = await getCashBox(userId);

        // find transaction belongs to this box
        const transaction = await Transaction.findOne({
            _id: id
            // moneyBoxId: box._id
        }).populate("supplierId", "name")

        if (!transaction) {
            return res.status(404).json({
                message: "Transaction not found"
            });
        }

        return res.status(200).json({
            transaction
        });

    } catch (err) {
        return res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};

// delete transaction by id
exports.deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const box = await getCashBox(userId);

        const deleted = await Transaction.findOneAndDelete({
            _id: id
            // moneyBoxId: box._id
        });

        if (!deleted) {
            return res.status(404).json({
                message: "Transaction not found"
            });
        }

        return res.status(200).json({
            message: "تم الحذف بنجاح"
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};

// update transaction by id
exports.updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { note, items } = req.body;
        const userId = req.user.userId;

        const box = await getCashBox(userId);

        const transaction = await Transaction.findOne({
            _id: id
            // moneyBoxId: box._id
        });

        if (!transaction) {
            return res.status(404).json({ message: "Not found" });
        }

        if (note) {
            transaction.note = note;
        }

        if (items && Array.isArray(items)) {
            transaction.items = items;
        }

        await transaction.save(); // total auto recalculated

        return res.status(200).json({
            message: "تم التعديل بنجاح",
            transaction
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// get transactions
exports.getAllTransactions = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { type, from, to } = req.query;

        const box = await getCashBox(userId);

        // moneyBoxId: box._id
        let filter = {   totalAmount: { $gt: 0 } };

        if (type) filter.type = type;

        if (from || to) {
            filter.date = {};
            if (from) filter.date.$gte = new Date(from);
            if (to) filter.date.$lte = new Date(to);
        }

        const transactions = await Transaction.find(filter)
            .sort({ date: -1 })
            .populate("supplierId" ,"name phone")
            .lean();

        return res.status(200).json({
            count: transactions.length,
            transactions
        });

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
};
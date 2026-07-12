const Expense =require(`${__dirname}/../../models/expense`);
const { getCashBox } = require(`${__dirname}/../../services/moneyBox`);
const Transaction = require(`${__dirname}/../../models/TransactionBox`);
const mongoose =require('mongoose');


// create Expense
exports.createExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.userId;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        message: "يجب إدخال مصروف واحد على الأقل"
      });
    }

    // إنشاء Expense جديد
    const expense = await Expense.create([{
      items,
      createdBy: userId,
      updatedBy: userId
    }], { session });

    const createdExpense = expense[0];

    // الحصول على الخزنة
    const box = await getCashBox(userId, session);

    // إنشاء Transaction مرتبطة بهذا الـ Expense فقط
    const transaction = await Transaction.create([{
      moneyBoxId: box._id,
      type: "expense",
      items: items.map(item => ({
        title: `${item.title}${item.note ? " | " + item.note : ""}`,
        category: "expense",
        amount: item.amount
      })),
      expenseId: createdExpense._id,
      note: "مصروفات خارجه من الخزنه"
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Expense created successfully",
      expense: createdExpense,
      transaction: transaction[0]
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      error: err.message
    });
  }
};

exports.deleteExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expense = await Expense.findById(req.params.id).session(session);

    if (!expense) {
      return res.status(404).json({
        message: "Expense not found"
      });
    }

    await Transaction.deleteMany({
      expenseId: expense._id
    }).session(session);

    await expense.deleteOne({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: "Expense deleted successfully"
    });

  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      error: err.message
    });

  } finally {
    session.endSession();
  }
};



exports.updateExpense = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.userId;
    const { items, expenseDate } = req.body;

  
    const expense = await Expense.findById(req.params.id).session(session);

    if (!expense) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "Expense not found"
      });
    }

   
    if (expenseDate) {
      expense.expenseDate = new Date(expenseDate);
    }

  
    if (items && items.length > 0) {
      expense.items = items.map((item) => ({
        title: item.title,
        amount: item.amount,
        note: item.note || ""
      }));
    }

    expense.updatedBy = userId;

    await expense.save({ session });

   
    const transactionItems = expense.items.map((item) => ({
      title: item.note
        ? `${item.title} | ${item.note}`
        : item.title,
      category: "expense",
      amount: item.amount
    }));

  
    const transaction = await Transaction.findOneAndUpdate(
      { expenseId: expense._id },
      {
        items: transactionItems,
        totalAmount: expense.totalAmount,
        note: "مصروفات خارجه من الخزنه",
        date: expense.expenseDate 
      },
      {
        new: true,
        session
      }
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    await session.commitTransaction();

    res.status(200).json({
      message: "Expense updated successfully",
      expense,
      transaction
    });

  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      error: err.message
    });

  } finally {
    session.endSession();
  }
};

// getAllExpenses
exports.getAllExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search?.trim() || "";

    const skip = (page - 1) * limit;

    const filter = {};

    if (search) {
      filter["items.title"] = {
        $regex: search,
        $options: "i",
      };
    }

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate("createdBy", "username")
        .populate("updatedBy", "username")
        .sort({ expenseDate: -1 })
        .skip(skip)
        .limit(limit),

      Expense.countDocuments(filter),
    ]);

    res.status(200).json({
      expenses,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// getExpenseById
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username');

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// get current Expenses
exports.getCurrentExpenses = async (req, res) => {
 try {

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);


    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const expenses = await Expense.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

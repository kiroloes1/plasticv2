const Expense = require(`../../models/expense`);

exports.getExpenseReport = async (req, res) => {
  try {

    const { filter, startDate, endDate } = req.query;

    const now = new Date();

    let dateMatch = {};

    // DAILY
    if (filter === "daily") {
      const start = new Date();
      start.setHours(0,0,0,0);

      const end = new Date();
      end.setHours(23,59,59,999);

      dateMatch = { expenseDate: { $gte: start, $lte: end } };
    }

    // MONTHLY
    else if (filter === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

      dateMatch = { expenseDate: { $gte: start, $lte: end } };
    }

    // YEARLY
    else if (filter === "yearly") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);

      dateMatch = { expenseDate: { $gte: start, $lte: end } };
    }

    // CUSTOM
    else if (filter === "custom") {
      dateMatch = {
        expenseDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    const report = await Expense.aggregate([

      // 1. filter
      { $match: dateMatch },

      // 2. unwind items
      { $unwind: "$items" },

      // 3. group per expense
      {
        $group: {

          _id: "$_id",

          totalAmount: { $first: "$totalAmount" },

          items: { $push: "$items" }

        }
      },

      // 4. final aggregation
      {
        $group: {

          _id: null,

          totalExpenses: { $sum: 1 },

          totalMoney: { $sum: "$totalAmount" },

          items: { $push: "$items" }

        }
      }

    ]);

    res.json({
      success: true,
      report: report[0] || {}
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
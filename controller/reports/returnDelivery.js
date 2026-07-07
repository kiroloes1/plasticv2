const ReturnDelivery = require(`${__dirname}/../../models/returnDelivery`);

exports.getReturnReport = async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const now = new Date();

    let dateMatch = {};

    // DAILY
    if (filter === "daily") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      dateMatch = { deliveryDate: { $gte: start, $lte: end } };
    }

    // MONTHLY
    else if (filter === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      dateMatch = { deliveryDate: { $gte: start, $lte: end } };
    }

    // YEARLY
    else if (filter === "yearly") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);

      dateMatch = { deliveryDate: { $gte: start, $lte: end } };
    }

    // CUSTOM
    else if (filter === "custom") {
      dateMatch = {
        deliveryDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

const report = await ReturnDelivery.aggregate([

  { $match: dateMatch },

  { $unwind: "$items" },

  { $unwind: "$items.batches" },

  {
    $lookup: {
      from: "items", // اسم collection في MongoDB (مش model name)
      localField: "items.item",
      foreignField: "_id",
      as: "itemData"
    }
  },

  {
    $unwind: {
      path: "$itemData",
      preserveNullAndEmptyArrays: true
    }
  },

  {
    $group: {
      _id: "$items.item",

      itemName: { $first: "$itemData.name" },

      totalWeight: { $sum: "$items.batches.weight" },

      totalQuantity: { $sum: "$items.batches.quantity" },

      totalReturnPrice: { $sum: "$items.totalReturnPrice" }
    }
  },

  {
    $group: {
      _id: null,

      totalReturns: { $sum: 1 },
      totalWeight: { $sum: "$totalWeight" },
      totalItems: { $sum: "$totalQuantity" },

      items: {
        $push: {
          name: "$itemName",
          weight: "$totalWeight",
          quantity: "$totalQuantity",
          totalReturnPrice:"$totalReturnPrice"
        }
      }
    }
  }

]);

    res.json({
      success: true,
      report: report[0] || {
        totalReturns: 0,
        totalReturnAmount: 0,
        totalReturnWeight: 0,
        totalItems: 0,
        products: []
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
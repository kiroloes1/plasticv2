const Supplier = require(`${__dirname}/../../models/supplier`);

exports.getSuppliersReport = async (req, res) => {
  try {

    const { filter, startDate, endDate } = req.query;

    const now = new Date();

    let dateMatch = {};

    // ================= DATE FILTER =================
    if (filter === "daily") {

      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      dateMatch = {
        "transactions.date": { $gte: start, $lte: end }
      };

    }

    else if (filter === "monthly") {

      const start = new Date(now.getFullYear(), now.getMonth(), 1);

      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      dateMatch = {
        "transactions.date": { $gte: start, $lte: end }
      };

    }

    else if (filter === "yearly") {

      const start = new Date(now.getFullYear(), 0, 1);

      const end = new Date(now.getFullYear(), 11, 31);

      dateMatch = {
        "transactions.date": { $gte: start, $lte: end }
      };

    }

    else if (filter === "custom") {

      dateMatch = {
        "transactions.date": {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };

    }

    // ================= AGGREGATION =================
    const report = await Supplier.aggregate([

      {
        $match: {
          transactions: { $exists: true, $ne: [] }
        }
      },

      {
        $unwind: "$transactions"
      },

      {
        $match: dateMatch
      },

      {
        $group: {

          _id: "$_id",

          name: { $first: "$name" },

          phone: { $first: "$phone" },

          paymentHistory: { $first: "$paymentHistory" },

          currentDebt: { $first: "$remainingBalance" },

          // ================= PURCHASES =================
          totalPurchases: {
            $sum: {
              $cond: [
                { $eq: ["$transactions.type", "delivery"] },
                "$transactions.totalAmount",
                0
              ]
            }
          },

          // ================= RETURNS =================
          totalReturns: {
            $sum: {
              $cond: [
                { $eq: ["$transactions.type", "return"] },
                "$transactions.totalAmount",
                0
              ]
            }
          },

          // ================= PAID IN TRANSACTIONS =================
          totalPaid: {
            $sum: "$transactions.paid"
          }

        }

      },

      {
        $project: {

          name: 1,

          phone: 1,

          totalPurchases: 1,

          totalReturns: 1,

          totalPaid: 1,

          currentDebt: 1,

          // ================= NET PURCHASES =================
          netPurchases: {
            $subtract: ["$totalPurchases", "$totalReturns"]
          },

          // ================= TOTAL DEBT =================
          totalDebt: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    { $eq: ["$$p.type", "debt"] },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          },

          // ================= TOTAL PAYMENTS =================
          totalPayments: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    { $eq: ["$$p.type", "payment"] },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          },

          // ================= CASH =================
          cash: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$p.type", "payment"] },
                        { $eq: ["$$p.paymentMethod", "cash"] }
                      ]
                    },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          },

          // ================= WALLET =================
          wallet: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$p.type", "payment"] },
                        { $eq: ["$$p.paymentMethod", "wallet"] }
                      ]
                    },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          },

          // ================= BANK =================
          bank: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$p.type", "payment"] },
                        { $eq: ["$$p.paymentMethod", "bank transfer"] }
                      ]
                    },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          },

          // ================= WORK =================
          work: {
            $sum: {
              $map: {
                input: "$paymentHistory",
                as: "p",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$p.type", "payment"] },
                        { $eq: ["$$p.paymentMethod", "work"] }
                      ]
                    },
                    "$$p.amount",
                    0
                  ]
                }
              }
            }
          }

        }

      },

      {
        $sort: { currentDebt: -1 }
      }

    ]);

    res.json({
      success: true,
      count: report.length,
      report
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};


exports.getSupplierTransportReport = async (req, res) => {
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

      dateMatch = {
        "deliveryData.deliveryDate": {
          $gte: start,
          $lte: end
        }
      };

    }

    // MONTHLY
    else if (filter === "monthly") {

      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      const end = new Date(
        now.getFullYear(),
        now.getMonth()+1,
        0,
        23,59,59
      );

      dateMatch = {
        "deliveryData.deliveryDate": {
          $gte:start,
          $lte:end
        }
      };

    }

    // YEARLY
    else if (filter === "yearly") {

      const start =
      new Date(now.getFullYear(),0,1);

      const end =
      new Date(now.getFullYear(),11,31,23,59,59);

      dateMatch={
        "deliveryData.deliveryDate":{
          $gte:start,
          $lte:end
        }
      };

    }

    // CUSTOM
    else if(filter==="custom"){

      dateMatch={
        "deliveryData.deliveryDate":{
          $gte:new Date(startDate),
          $lte:new Date(endDate)
        }
      };

    }


    const report = await Supplier.aggregate([

      {
        $lookup:{
          from:"delivers",
          localField:"_id",
          foreignField:"supplier",
          as:"deliveryData"
        }
      },

      {
        $unwind:"$deliveryData"
      },

      {
        $match:dateMatch
      },

      {
        $unwind:"$deliveryData.items"
      },

      {
        $unwind:"$deliveryData.items.batches"
      },

      {

        $group:{

          _id:"$_id",

          supplierName:{
            $first:"$name"
          },

          phone:{
            $first:"$phone"
          },

          deliveryCount:{
            $addToSet:
            "$deliveryData._id"
          },

          totalWeight:{
            $sum:
            "$deliveryData.items.batches.weight"
          },

          totalQuantity:{
            $sum:
            "$deliveryData.items.batches.quantity"
          },

          totalReturnWeight:{
            $sum:{
              $ifNull:[
                "$deliveryData.items.returnWeight",
                0
              ]
            }
          }

        }

      },

      {

        $project:{

          supplierName:1,

          phone:1,

          numberOfTransport:{
            $size:
            "$deliveryCount"
          },

          totalWeight:1,

          totalQuantity:1,

          totalReturnWeight:1,

          netWeight:{
            $subtract:[
              "$totalWeight",
              "$totalReturnWeight"
            ]
          }

        }

      },

      {

        $sort:{
          totalWeight:-1
        }

      }

    ]);



    return res.json({

      success:true,

      count:report.length,

      report

    });

  }

  catch(err){

    return res.status(500).json({

      success:false,

      message:err.message

    });

  }

};
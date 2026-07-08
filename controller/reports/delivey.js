const Deliver = require(`../../models/delivery`);

exports.getDeliveriesReport = async (req, res) => {
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

      dateMatch = { deliveryDate: { $gte: start, $lte: end } };
    }

    // MONTHLY
    else if (filter === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

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

    const report = await Deliver.aggregate([

      // 1. filter deliveries
      { $match: dateMatch },

      // 2. unwind items
      { $unwind: "$items" },

      // 3. unwind batches
      { $unwind: "$items.batches" },

      // 4. group per delivery
      {
        $group: {

          _id: "$_id",

          deliveryDate: { $first: "$deliveryDate" },

          // money
          totalAmount: { $first: "$totalAmount" },

          paidAmount: { $first: "$paidAmount" },

          remainingAmount: { $first: "$remainingAmount" },

          teaForWorkers: { $first: "$teaForWorkers" },

          carPayment: { $first: "$carPayment" },

          payment: { $first: "$payment" },

          // items count
          itemsCount: { $sum: 1 },

          // total weight
          totalWeight: {
            $sum: "$items.batches.weight"
          },
           // total return weight
          totalReturnWeight: {
            $sum: "$items.totalWeight"
          }

        }
      },

      // 5. final aggregation
      {
        $group: {

          _id: null,

          totalTrips: { $sum: 1 },

          totalPaid: { $sum: "$paidAmount" },

          totalRemaining: { $sum: "$remainingAmount" },

          totalTea: { $sum: "$teaForWorkers" },

          totalCarPayment: { $sum: "$carPayment" },

          totalWeight: { $sum: "$totalWeight" },

          totalItems: { $sum: "$itemsCount" },

          // payment breakdown
          cash: {
            $sum: {
              $sum: {
                $map: {
                  input: "$payment",
                  as: "p",
                  in: {
                    $cond: [
                      { $eq: ["$$p.paymentMethod", "cash"] },
                      "$$p.paidAmount",
                      0
                    ]
                  }
                }
              }
            }
          },

          wallet: {
            $sum: {
              $sum: {
                $map: {
                  input: "$payment",
                  as: "p",
                  in: {
                    $cond: [
                      { $eq: ["$$p.paymentMethod", "wallet"] },
                      "$$p.paidAmount",
                      0
                    ]
                  }
                }
              }
            }
          },

          instapay: {
            $sum: {
              $sum: {
                $map: {
                  input: "$payment",
                  as: "p",
                  in: {
                    $cond: [
                      { $eq: ["$$p.paymentMethod", "instapay"] },
                      "$$p.paidAmount",
                      0
                    ]
                  }
                }
              }
            }
          },

          bank: {
            $sum: {
              $sum: {
                $map: {
                  input: "$payment",
                  as: "p",
                  in: {
                    $cond: [
                      { $eq: ["$$p.paymentMethod", "bank"] },
                      "$$p.paidAmount",
                      0
                    ]
                  }
                }
              }
            }
          }

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



// controllers/delivery.controller.js

exports.getItemsTotalWeights = async (req, res) => {
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

      dateMatch = { deliveryDate: { $gte: start, $lte: end } };
    }

    // MONTHLY
    else if (filter === "monthly") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

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

    const result = await Deliver.aggregate([

            // 1. filter deliveries
      { $match: dateMatch },
    
      { $unwind: "$items" },

     
      { $unwind: "$items.batches" },

    
      {
        $group: {
          _id: "$items.item",

          totalWeight: {
            $sum: "$items.batches.weight"
          },

          totalQuantity: {
            $sum: "$items.batches.quantity"
          }
        }
      },

 
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "_id",
          as: "item"
        }
      },

      { $unwind: "$item" },

      
      {
        $project: {
          _id: 0,
          itemId: "$item._id",
          itemName: "$item.name",
          totalWeight: 1,
          totalQuantity: 1
        }
      }

    ]);

    res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};




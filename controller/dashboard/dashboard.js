// controllers/dashboard.controller.js

const Supplier = require(`${__dirname}/../../models/supplier`);
const Deliver = require(`${__dirname}/../../models/delivery`);
const Return = require(`${__dirname}/../../models/returnDelivery`); 
const User = require(`${__dirname}/../../models/users`);
const Worker = require(`${__dirname}/../../models/workerModel`);


// helper function for date filtering
const getDateFilter = (filter, from, to) => {

  const now = new Date();

  let startDate;
  let endDate = new Date();

  switch (filter) {

    // default => today
    case 'daily':
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      break;

    case 'monthly':
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
      break;

    case 'yearly':
      startDate = new Date(
        now.getFullYear(),
        0,
        1
      );
      break;

    case 'custom':
      startDate = new Date(from);
      endDate = new Date(to);
      break;

    default:
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
  }

  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
};



// dashboard controller
exports.getDashboard = async (req, res) => {

  try {

    const {
      filter = 'daily',
      from,
      to
    } = req.query;

    const dateFilter = getDateFilter(filter, from, to);


    // suppliers
    const totalSuppliers = await Supplier.countDocuments();

    // suppliers owe us (negative)
    const suppliersOweUs = await Supplier.countDocuments({
      remainingBalance: { $lt: 0 }
    });

    // we owe suppliers (positive)
    const weOweSuppliers = await Supplier.countDocuments({
      remainingBalance: { $gt: 0 }
    });



    // total money for us
    const moneyForUs = await Supplier.aggregate([
      {
        $match: {
          remainingBalance: { $lt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$remainingBalance"
          }
        }
      }
    ]);



    // total money on us
    const moneyOnUs = await Supplier.aggregate([
      {
        $match: {
          remainingBalance: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$remainingBalance"
          }
        }
      }
    ]);



    // users
    const totalUsers = await User.countDocuments();


    // deliveries
    const totalDeliveries = await Deliver.countDocuments(dateFilter);


    // returns
    const totalReturns = await Return.countDocuments(dateFilter);

    const Worker =await Worker.countDocuments();

    res.status(200).json({

      success: true,

      filter,

      data: {

        suppliers: {

          totalSuppliers,

          suppliersOweUs,

          weOweSuppliers,

          totalMoneyForUs:
            Math.abs(moneyForUs[0]?.total || 0),

          totalMoneyOnUs:
            moneyOnUs[0]?.total || 0
        },

        system: {

          totalUsers,

          totalDeliveries,

          totalReturns,
          Worker
        }
      }
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


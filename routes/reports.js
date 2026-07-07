const express = require(`express`);
const router=express.Router();
const authorizationMiddleware = require(`${__dirname}/../middlewares/authorization`);
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const expenses=require(`../controller/reports/expense`);
const suppliers=require(`../controller/reports/suppliers`);
const delivey=require(`../controller/reports/delivey`);
const returnDelivery=require(`../controller/reports/returnDelivery`);
const dashboard=require(`../controller/dashboard/dashboard`);


// protected routes
router.use(authMiddleware.protected);

router.use(authorizationMiddleware.role('superadmin', 'manager')); 

router.get("/expenses", expenses.getExpenseReport );
router.get("/suppliers", suppliers.getSuppliersReport );
router.get("/delivey", delivey.getDeliveriesReport );
router.get("/items", delivey.getItemsTotalWeights);
router.get("/returnDelivery", returnDelivery.getReturnReport);
router.get("/dashboard", dashboard.getDashboard);
router.get("/getSupplierTransportReport", suppliers.getSupplierTransportReport);




module.exports=router;
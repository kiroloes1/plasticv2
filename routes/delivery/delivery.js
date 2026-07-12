const express = require('express');
const router = express.Router();
const deliveryController = require(`${__dirname}/../../controller/delivery/delivey`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 


router.get("/migrate-payment", deliveryController.migratePayments);
// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 
// Create a delivery
router.post('/', deliveryController.createDelivery);

// Update a delivery
router.put('/:id', deliveryController.updateDelivery);


router.delete('/less/:id', deliveryController.deleteDeliveryless);

// Delete a delivery
router.delete('/:id', deliveryController.deleteDelivery);


// Get all deliveries
router.get('/', deliveryController.getAllDeliveries);


router.get('/getAllDeliveriesless', deliveryController.getAllDeliveriesless);

// Get delivery by supplier id
router.get('/getDeliveryBySupplier/:supplierId', deliveryController.getDeliveryBySupplier);

// Get delivery by ID
router.get('/:id', deliveryController.getDeliveryById);


module.exports = router;

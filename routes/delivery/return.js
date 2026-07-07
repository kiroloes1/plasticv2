const express = require('express');
const router = express.Router();
const {
    createReturnDelivery,
    updateReturnDelivery,
    deleteReturnDelivery,
    getAllReturnDeliveries,
    getReturnById,
    getReturnBySupplier,
    getAllReturnDeliveriesALL
} = require(`${__dirname}/../../controller/delivery/return`);
const {role}= require(`${__dirname}/../../middlewares/authorization`) 
const { protected } = require(`${__dirname}/../../middlewares/authMiddleware`); 

// All routes are protecterd
router.use(protected);
const authorizationMiddleware = require(`${__dirname}/../../middlewares/authorization`);
router.use(authorizationMiddleware.role("superadmin","manager")); 

//Create Return
router.post('/', createReturnDelivery);

//Update Return
router.put('/:id', updateReturnDelivery);

// Delete Return
router.delete('/:id', deleteReturnDelivery);

// Get All Returns
router.get('/', getAllReturnDeliveries);

router.get('/getAllReturnDeliveriesALL', getAllReturnDeliveriesALL);


// Get By ID 
router.get('/:id', getReturnById);

//Get By Supplier
router.get('/supplier/:supplierId', getReturnBySupplier);

module.exports = router;
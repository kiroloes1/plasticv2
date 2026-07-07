const express = require(`express`);
const router=express.Router();
const authMiddleware = require(`${__dirname}/../middlewares/authMiddleware`);
const adminControllers = require(`${__dirname}/../controller/user`);

// login route
router.post('/login', adminControllers.login);

// refresh token
router.post('/refresh-token', adminControllers.refreshToken);

// reset password
router.put('/reset-password', adminControllers.resetPassword);

// forget password
router.put('/forgot-password', adminControllers.forgetPassword);

// protected routes
router.use(authMiddleware.protected);

// logout
router.post('/logout', adminControllers.userLogout);


// update password
router.put('/update-password', adminControllers.updatePassword);

module.exports=router;
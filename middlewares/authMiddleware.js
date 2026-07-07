const jwt=require('jsonwebtoken');
const User=require(`${__dirname}/../models/users`);
exports.protected=async(req,res,next)=>{
    const authHeader=req.headers.authorization;;
    if(!authHeader || !authHeader.startsWith('Bearer')){
        return res.status(401).json({message:"نتهت الجلسة يجب عليك ان تسجل دخول مره اخري"});
    }
    const token=authHeader.split(" ")[1];
    if(!token){
        return res.status(401).json({message:"نتهت الجلسة يجب عليك ان تسجل دخول مره اخري"});
    }
    try{
     const decoded=jwt.verify(token,process.env.ACCESS_JWT_SECRET);
     if(!decoded){
        return res.status(401).json({message:"يجب عليك تسجيل الدخول "});
     }
     const user=await User.findById(decoded.userId).select('-password');
     if(!user){
        return res.status(401).json({message:"هذا الحساب لم يعد موجودا في السيستم"});
     }
     req.user=decoded;
     next();

    }catch(error){
        res.status(401).json({message:"خطاء يجب عليك تسجيل الدخول ",error:error.message});
    }
}
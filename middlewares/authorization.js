exports.role=(...role)=>{
    return (req,res,next)=>{

         if (!req.user || !req.user.role) {
        return res.status(401).json({ message: "غير مسموح لك بالوصول لهذه الصفحه" });
        }

        if(!role.includes(req.user.role)){
            return res.status(403).json({message:"غير مسموح لك بالوصول لهذه الصفحه"});
        }
        next();
    }
}
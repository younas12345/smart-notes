const jwt= require("jsonwebtoken");
function auth(req,res,next){
    const authHeader= req.headers.authorization;
    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({
            message:"Acces Denied"
        });
    }
    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
        return res.status(401).json({
            message:"Acces Denied"
        });
    }

    try{
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (typeof decoded !== "object" || !decoded.userId) {
            return res.status(401).json({
                message:"invalid Token"
            });
        }

        req.user = { userId: decoded.userId };
        next();
    }catch(error){
        res.status(401).json({
            message:"invalid Token"
        });
    }
}
module.exports= auth;
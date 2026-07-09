const express = require('express');
require('dotenv').config()
const app = express();
const path = require("path");
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.set('trust proxy', true);
const cors =require('cors')
const bodyParser = require('body-parser');
app.use(cors({
  origin: true,
  credentials: true
}));

const mongoose = require("mongoose");
const config=require(`${__dirname}/config/configDB`);
const user=require(`${__dirname}/routes/user`);
const adminRoutes = require(`${__dirname}/routes/controlAdmin`);
const supplierRoute = require(`${__dirname}/routes/supplier`);
const BoxRoute = require(`${__dirname}/routes/box`);
const itemRoute = require(`${__dirname}/routes/delivery/items`);
const expenceRoute= require(`${__dirname}/routes/expense`)
const deliveryRoutes =require(`${__dirname}/routes/delivery/delivery`)
const ReturnDeliveryRoute=require(`${__dirname}/routes/delivery/return`);
const outDelivery=require(`${__dirname}/routes/delivery/outDelivery`);
const reports=require(`${__dirname}/routes/reports`);
const backupRoutes = require("./backups/backup");
const worker=require(`${__dirname}/routes/workers/workerRouter`)

config.connectDB(process.env.DATABASE);




app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use('/v1/users',user);
app.use("/v1/admins", adminRoutes);
app.use('/v1/suppliers',supplierRoute);
app.use('/v1/box',BoxRoute);
app.use('/v1/item',itemRoute);
app.use('/v1/expense',expenceRoute);
app.use("/v1/delivery", deliveryRoutes);
app.use("/v1/ReturnDelivery", ReturnDeliveryRoute);
app.use("/v1/outDelivery", outDelivery);
app.use("/v1/reports", reports);
app.use("/v1/worker", worker);


app.use("/v1/", backupRoutes);







const PORT=process.env.PORT || 5000;
app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})

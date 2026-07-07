const mongoose = require('mongoose');


const batchSchema = new mongoose.Schema({
  quantity: { type: Number, required: true , min: 1},   
  weight: { type: Number, required: true , min: 0 },      
});


// each item in a return delivery, which can have multiple batches
const deliveryItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, 
  batches: [batchSchema], 
  totalReturnWeight: { type: Number, default: 0 }, 
  pricePerKg: { type: Number, required: true },      
  totalReturnPrice: { type: Number , default: 0} ,
  reasonForReturn: { type: String ,required: true },
});


const ReturnDeliveySchema = new mongoose.Schema({
  delveryNumber: { type: Number },
  deliveryDate: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  
    supplier:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required:true
    },
    items:[deliveryItemSchema],
    notes: { type: String },
     totalAmount: { type: Number, default: 0 }, 

      oldBalance: { type: Number, default: 0 }, 
    
}, { timestamps: true });

module.exports = mongoose.model('ReturnDelivey', ReturnDeliveySchema);
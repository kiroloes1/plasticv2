const mongoose = require('mongoose');
const supplierSchema = new mongoose.Schema({

 //  info to supplier
  name: { type: String, required: true },     
  phone: { type: String ,required: true },                      
  notes: { type: String },                    

//   delivery operation
  transactions: [
    {
      type: { type: String, enum: ["delivery" , "return","outdelivery"], default: "delivery" },

      deliveryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Deliver', 
        
      },

      totalAmount: Number,
      paid: Number,
      remainingBalance: Number,
        payment:[{
       paidAmount: { type: Number, default: 0 },           
       paymentMethod:{
        type:String,
        enum:["cash" , "wallet" ,"instapay" ,"bank" ,"work","mail"]
       }
  }],   

      note: String,
      date: { type: Date, default: Date.now }
    }
  ],

//  payment
  paymentHistory: [
    {
      type: { type: String, enum: ["payment", "debt"] },
      paymentMethod: { type: String, enum: ["cash", "bank transfer", "wallet","work","mail"] },
      amount: { type: Number, required: true },
      date: { type: Date, default: Date.now },
      note: String,
    
    }
  ],


  remainingBalance:{
    type:Number,
    default:0
  },      

}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);

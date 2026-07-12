const express = require("express");
const router = express.Router();
const workerCtrl = require(`${__dirname}/../../controller/worker/workerControllers`);
const authMiddleware = require(`${__dirname}/../../middlewares/authMiddleware`);
const { role } = require(`${__dirname}/../../middlewares/authorization`); 

// ========================== MIDDLEWARES ==========================

// حماية جميع المسارات وحصرها على الأدوار المحددة (Superadmin و Manager)
router.use(authMiddleware.protected);
router.use(role("superadmin", "manager"));

// ========================== ROUTES ==========================

// --- 1. إدارة العمال (الأساسيات) ---

// إضافة عامل جديد (الاسم واليومية)
router.post("/add", workerCtrl.createWorker);

// جلب قائمة كل العمال (الاسم، اليومية، والرصيد)
router.get("/all", workerCtrl.getWorkers);

// details to foods and  advance (general financial details for worker)
router.get("/financial-details", workerCtrl.getFinancialDetails);

// details to  net salary and deductions (general financial details for worker)
router.get("/payroll-details", workerCtrl.getNetSalaryDetails);


// pressent and absent details for all workers (general attendance details for worker)
router.get("/attendance-details", workerCtrl.getAttendanceDetails);

// جلب بيانات عامل واحد بالتفصيل (الحسابات، الحضور، الأرشيف)
router.get("/:id", workerCtrl.getWorkerById);

router.get('/payroll/total-summary', workerCtrl.getPayrollSummary);
// مسار التعديل
router.put('/:id', workerCtrl.updateWorker);

// مسار الحذف
router.delete('/:id', workerCtrl.deleteWorker);
// --- 2. العمليات اليومية (الحضور والماليات) ---

// تصفير شامل (Reset)
router.post("/:id/reset", workerCtrl.resetWorkerAccount);

// تسجيل حضور أو غياب اليوم
router.post("/:id/attendance", workerCtrl.markAttendance);

// تسجيل (سلفة، مصروف أكل، أو خصم)
router.post("/:id/financial", workerCtrl.addFinancial);

router.put("/reorder", workerCtrl.reorderWorkers);
// تعديل عملية مالية
router.put("/:id/financial/:recordId", workerCtrl.editFinancial);

// حذف عملية مالية
router.delete("/:id/financial/:recordId", workerCtrl.deleteFinancial);

// --- 3. الحسابات والمحاسبة (تصفية الراتب) ---

// تصفية حساب العامل (حساب الأيام والخصومات وترحيل الباقي)
router.post("/:id/pay", workerCtrl.paySalary);

// تعديل الرصيد يدوياً (إضافة أو خصم مبلغ من الـ Balance)
router.patch("/:id/balance", workerCtrl.updateBalance);


module.exports = router;

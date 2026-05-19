import { Router } from 'express';
import { initializeWheel, joinWheel, startWheelManually, getActiveWheel } from '../controllers/spinWheelController.js';

const router = Router();

router.get('/active', getActiveWheel);
router.post('/initialize', initializeWheel);
router.post('/join', joinWheel);
router.post('/start', startWheelManually);

export default router;

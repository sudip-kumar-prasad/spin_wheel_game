import { Router } from 'express';
import {
  initializeWheel,
  joinWheel,
  startWheelManually,
  startWheel,
  abortWheel,
  getActiveWheel,
  getConfig,
  updateConfig
} from '../controllers/spinWheelController.js';

const router = Router();

router.get('/active', getActiveWheel);
router.post('/initialize', initializeWheel);
router.post('/join', joinWheel);
router.post('/start', startWheelManually);
router.post('/startManual', startWheel);
router.post('/abort', abortWheel);

router.get('/config', getConfig);
router.post('/config', updateConfig);

export default router;

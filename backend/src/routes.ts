import { Router } from 'express';
import { TimeRecordController } from './controllers/timeRecordController';

const routes = Router();
const timeRecordController = new TimeRecordController();

import { HolidayService } from './services/holidayService';
import { SettingsController } from './controllers/settingsController';
import { RecalculateController } from './controllers/recalculateController';
import { PlantaoEventController } from './controllers/plantaoEventController';

const settingsController = new SettingsController();
const recalculateController = new RecalculateController();
const plantaoEventController = new PlantaoEventController();

routes.get('/records/balance', timeRecordController.balance);
routes.get('/records', timeRecordController.list);
routes.post('/records/punch', timeRecordController.punch);
routes.post('/records/undo', timeRecordController.undoLastPunch);
routes.post('/records/recalculate', recalculateController.recalculateAll);
routes.put('/records/:id', timeRecordController.update);
routes.delete('/records/:id', timeRecordController.delete);

routes.get('/records-events', plantaoEventController.list);
routes.post('/records-events', plantaoEventController.create);
routes.put('/records-events/:id', plantaoEventController.update);
routes.delete('/records-events/:id', plantaoEventController.delete);

routes.get('/settings', settingsController.get);
routes.put('/settings', settingsController.update);

routes.get('/holidays/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const holidays = await HolidayService.getHolidays(year);
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar feriados' });
  }
});

routes.get('/holidays/:year/details', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const holidays = await HolidayService.getHolidaysDetailed(year);
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar feriados' });
  }
});

export default routes;

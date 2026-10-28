import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../src/services/liveConnection', () => ({ subscribeLive: vi.fn() }));
vi.mock('../src/services/apiClient', () => ({ ApiClient: {} }));
import { filterHistory, historyCsv } from '../src/services/securityWorkflow';
import { SoundAlertService } from '../src/services/soundAlertService';
import type { SecurityEvent } from '../src/types/events';

const event = (changes: Partial<SecurityEvent> = {}): SecurityEvent => ({ id:'test', timestamp:new Date(2026, 9, 28, 12).toISOString(), eventType:'Unknown Face', source:'ESP32-CAM', severity:'warning', mode:'LIVE_CONNECTED', acknowledged:false, description:'Visitor arrived', ...changes });
afterEach(() => { SoundAlertService.stopContinuousAlarm(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Security activity workflow', () => {
  it('filters local calendar dates, category and household member names together', () => {
    const arrival = event({ eventType:'Known Face Match', metadata:{recognizedName:'Ankit'} });
    expect(filterHistory([arrival,event()], '2026-10-28','2026-10-28','Known Face Match','ankit')).toEqual([arrival]);
    expect(filterHistory([arrival], '2026-10-29')).toEqual([]);
  });
  it('escapes spreadsheet formulas, quotes and newlines in exported data', () => {
    const csv = historyCsv([event({description:'=IMPORTXML("url")\nnext'})]);
    expect(csv).toContain('"\'=IMPORTXML(""url"")\nnext"');
    expect(csv).toContain('"Attended"');
  });
  it('links an exported activity row to its matching image file', () => {
    const csv = historyCsv([event({ id: 'visitor-7' })], new Map([['visitor-7', 'images/visitor-7.jpg']]));
    expect(csv).toContain('"Image file"');
    expect(csv).toContain('"images/visitor-7.jpg"');
  });
  it('rings repeatedly until stopped and never creates multiple alarm timers', () => {
    vi.useFakeTimers();
    const ring = vi.spyOn(SoundAlertService,'playIntrusionAlarm').mockImplementation(() => {});
    SoundAlertService.startContinuousAlarm(); SoundAlertService.startContinuousAlarm();
    vi.advanceTimersByTime(3300); expect(ring).toHaveBeenCalledTimes(4);
    SoundAlertService.stopContinuousAlarm(); vi.advanceTimersByTime(5000); expect(ring).toHaveBeenCalledTimes(4);
  });
});

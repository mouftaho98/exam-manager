// k6 inputs: BASE_URL, CHECK_IN_PATH (e.g. /exams/<id>/checkin), TOKEN (a proctor or instructor),
// and FIXTURES (a local JSON array of request bodies like {"email":"student@example.com"}).
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { scenario } from 'k6/execution';

const { BASE_URL, CHECK_IN_PATH, TOKEN, FIXTURES } = __ENV;
if (!BASE_URL || !CHECK_IN_PATH || !TOKEN || !FIXTURES) {
  throw new Error('Set BASE_URL, CHECK_IN_PATH, TOKEN, and FIXTURES');
}

const requests = new SharedArray('check-in request bodies', () => JSON.parse(open(FIXTURES)));
const rate = Number(__ENV.CHECK_INS_PER_SECOND || 10);
const expectedStatus = Number(__ENV.EXPECTED_STATUS || 200);
if (!Number.isInteger(rate) || rate < 1 || requests.length < rate * 240) {
  throw new Error('Supply a positive check-in rate and at least rate × 240 unique request bodies');
}

export const options = {
  scenarios: {
    check_ins: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { target: rate, duration: '30s' },
        { target: rate, duration: '3m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<1000'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const body = requests[scenario.iterationInTest];
  const response = http.post(BASE_URL + CHECK_IN_PATH, JSON.stringify(body), {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    tags: { name: 'student check-in' },
    redirects: 0,
  });
  check(response, { 'check-in returned expected status': result => result.status === expectedStatus });
}

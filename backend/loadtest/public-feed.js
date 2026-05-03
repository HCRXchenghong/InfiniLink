import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    public_read_mix: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1200'],
  },
};

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1').replace(/\/$/, '');

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/healthz`],
    ['GET', `${BASE_URL}/readyz`],
    ['GET', `${BASE_URL}/api/v1/configData`],
    ['GET', `${BASE_URL}/api/v1/index/banner`],
    ['GET', `${BASE_URL}/api/v1/index/posts?page=1&type=1`],
    ['GET', `${BASE_URL}/api/v1/search/hot/list`],
    ['GET', `${BASE_URL}/api/v1/tags/recommend`],
  ]);

  for (const response of responses) {
    check(response, {
      'status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}

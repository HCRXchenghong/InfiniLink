import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN || '';
const ENABLE_ORDER_CREATE = (__ENV.ENABLE_ORDER_CREATE || 'false').toLowerCase() === 'true';
const PAYMENT_METHOD = __ENV.PAYMENT_METHOD || 'ifpay';

if (!TOKEN) {
  throw new Error('TOKEN is required. Example: k6 run -e TOKEN=xxx backend/loadtest/auth-order.js');
}

export const options = {
  scenarios: {
    authenticated_mix: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    token: TOKEN,
  };
}

export default function () {
  const userInfo = http.get(`${BASE_URL}/api/v1/user/info`, {
    headers: authHeaders(),
  });
  check(userInfo, {
    'user info 200': (r) => r.status === 200,
  });

  const orders = http.get(`${BASE_URL}/api/v1/user/myOrder?page=1`, {
    headers: authHeaders(),
  });
  check(orders, {
    'my order 200': (r) => r.status === 200,
  });

  if (ENABLE_ORDER_CREATE) {
    const createOrder = http.post(
      `${BASE_URL}/api/v1/order`,
      JSON.stringify({
        type: 1,
        payment_method: PAYMENT_METHOD,
      }),
      {
        headers: authHeaders(),
      },
    );

    check(createOrder, {
      'order create returned response': (r) => r.status === 200 || r.status === 400 || r.status === 409 || r.status === 502,
    });
  }

  sleep(1);
}

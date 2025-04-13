import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Define success rates instead of just counters
export const createSuccessRate = new Rate('create_success');
export const readSuccessRate = new Rate('read_success');
export const updateSuccessRate = new Rate('update_success');
export const deleteSuccessRate = new Rate('delete_success');

// Keep counters too for backward compatibility
export let createChecks = new Counter('create_checks');
export let readChecks = new Counter('read_checks');
export let updateChecks = new Counter('update_checks');
export let deleteChecks = new Counter('delete_checks');

export let options = {
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be < 500ms
  },
};

// BASE_URL is provided via the environment
const baseUrl = __ENV.BASE_URL;

export default function () {
  // Generate a unique username for this iteration
  let username = 'testuser_' + Math.random().toString(36).substring(2, 15);

  // -------------------
  // 1) CREATE
  // -------------------
  let createPayload = JSON.stringify({
    username: username,
    password: 'password123',
    email: `${username}@example.com`,
    name: 'Test',
    surname: 'User',
    age: 30,
  });
  let createRes = http.post(`${baseUrl}/createUser`, createPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const createSuccess = check(createRes, {
    'create is 200': (r) => r.status === 200,
  });
  createSuccessRate.add(createSuccess);
  if (createSuccess) createChecks.add(1);

  // -------------------
  // 2) READ
  // -------------------
  let readPayload = JSON.stringify({ username: username });
  let readRes = http.post(`${baseUrl}/getUser`, readPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const readSuccess = check(readRes, {
    'read is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  readSuccessRate.add(readSuccess);
  if (readSuccess) readChecks.add(1);

  // -------------------
  // 3) UPDATE
  // -------------------
  let updatePayload = JSON.stringify({
    username: username,
    name: 'UpdatedName',
    password: 'updated123',
  });
  let updateRes = http.post(`${baseUrl}/updateUser`, updatePayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const updateSuccess = check(updateRes, {
    'update is 200': (r) => r.status === 200,
  });
  updateSuccessRate.add(updateSuccess);
  if (updateSuccess) updateChecks.add(1);

  // -------------------
  // 4) DELETE
  // -------------------
  let deletePayload = JSON.stringify({ username: username });
  let deleteRes = http.post(`${baseUrl}/deleteUser`, deletePayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const deleteSuccess = check(deleteRes, {
    'delete is 200': (r) => r.status === 200,
  });
  deleteSuccessRate.add(deleteSuccess);
  if (deleteSuccess) deleteChecks.add(1);

  // Short sleep to simulate realistic pacing
  sleep(0.1);
}

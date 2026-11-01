import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldRunTableDeletionWorker} from './table-deletion-worker-policy.js';
test('restored staging can disable deletion work while production defaults remain enabled',()=>{
 assert.equal(shouldRunTableDeletionWorker({NODE_ENV:'production',TABLE_DELETION_WORKER_ENABLED:'false'}),false);
 assert.equal(shouldRunTableDeletionWorker({NODE_ENV:'production'}),true);
 assert.equal(shouldRunTableDeletionWorker({NODE_ENV:'test'}),false);
});

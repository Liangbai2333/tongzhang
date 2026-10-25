BEGIN;
INSERT INTO users(id,username,email,password_hash) VALUES ('00000000-0000-4000-8000-000000000001','小安','u0@example.test','$argon2id$test-fixture-only');
INSERT INTO users(id,username,email,password_hash) VALUES ('00000000-0000-4000-8000-000000000002','小白','u1@example.test','$argon2id$test-fixture-only');
INSERT INTO users(id,username,email,password_hash) VALUES ('00000000-0000-4000-8000-000000000003','小陈','u2@example.test','$argon2id$test-fixture-only');
INSERT INTO users(id,username,email,password_hash) VALUES ('00000000-0000-4000-8000-000000000004','小丁','u3@example.test','$argon2id$test-fixture-only');
INSERT INTO ledgers(id,created_by_user_id,name) VALUES ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','鼓山一日'),('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','另一本');
INSERT INTO ledger_members(id,ledger_id,user_id) VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001');
INSERT INTO ledger_members(id,ledger_id,user_id) VALUES ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000002');
INSERT INTO ledger_members(id,ledger_id,user_id) VALUES ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000003');
INSERT INTO ledger_members(id,ledger_id,user_id) VALUES ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000004');
INSERT INTO expenses(id,ledger_id,recorder_member_id,payer_member_id,title,amount_cents,category,occurred_on,split_mode) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','食堂午餐',12000,'DINING','2026-10-10','EQUAL');
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expenses(id,ledger_id,recorder_member_id,payer_member_id,title,amount_cents,category,occurred_on,split_mode) VALUES ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','鼓山门票',12000,'TICKET','2026-10-10','EQUAL');
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expenses(id,ledger_id,recorder_member_id,payer_member_id,title,amount_cents,category,occurred_on,split_mode) VALUES ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000013','往返车费',6000,'TRANSPORT','2026-10-10','EQUAL');
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000100',3000);
INSERT INTO expense_splits(expense_id,member_id,ledger_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000100',3000);
DO $$ BEGIN INSERT INTO users(username,email,password_hash) VALUES ('重复','u0@example.test','$argon2id$x'); RAISE EXCEPTION 'expected failure: 邮箱唯一'; EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END $$;
DO $$ BEGIN UPDATE expenses SET amount_cents=-1 WHERE id='00000000-0000-4000-8000-000000000201'; RAISE EXCEPTION 'expected failure: 消费金额非负边界'; EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END $$;
DO $$ BEGIN UPDATE expenses SET ledger_id='00000000-0000-4000-8000-000000000101' WHERE id='00000000-0000-4000-8000-000000000201'; RAISE EXCEPTION 'expected failure: 跨账本付款人外键'; EXCEPTION WHEN SQLSTATE '23503' THEN NULL; END $$;
INSERT INTO image_assets(id,ledger_id,uploaded_by_user_id,kind,mime_type,byte_size,width,height,sha256,content) VALUES ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','RECEIPT','image/png',68,1,1,'6528ab9015aa95481b08dcdd35d71fdeff48f3876aad1d267fa52a34a915bcbf',decode('89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da63fcff1f0003030200ef9a1f5b0000000049454e44ae426082','hex'));
INSERT INTO expense_images(expense_id,ledger_id,image_id) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000401');
DO $$ BEGIN INSERT INTO expense_images(expense_id,ledger_id,image_id) VALUES ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000401'); RAISE EXCEPTION 'expected failure: 一笔最多一张收据'; EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END $$;
DO $$ BEGIN UPDATE image_assets SET byte_size=1 WHERE id='00000000-0000-4000-8000-000000000401'; RAISE EXCEPTION 'expected failure: 图片字节长度一致'; EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END $$;
INSERT INTO invitations(ledger_id,created_by_member_id,code,expires_at) VALUES ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','ABC234',now()+interval '7 days');
DO $$ BEGIN INSERT INTO invitations(ledger_id,created_by_member_id,code,expires_at) VALUES ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','ABC235',now()+interval '7 days'); RAISE EXCEPTION 'expected failure: 每本仅一条未撤销邀请'; EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END $$;
INSERT INTO settlement_batches(id,ledger_id,created_by_member_id,source_version,expense_total_cents,transfer_total_cents,transfer_count,net_snapshot,algorithm_version) VALUES ('00000000-0000-4000-8000-000000000300','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011',1,30000,9000,2,'[{"memberId": "00000000-0000-4000-8000-000000000011", "netCents": "3000"}, {"memberId": "00000000-0000-4000-8000-000000000012", "netCents": "6000"}, {"memberId": "00000000-0000-4000-8000-000000000013", "netCents": "-3000"}, {"memberId": "00000000-0000-4000-8000-000000000014", "netCents": "-6000"}]'::jsonb,'zero-sum-dp-v1');
DO $$ BEGIN INSERT INTO settlement_batches(ledger_id,created_by_member_id,source_version,expense_total_cents,transfer_total_cents,transfer_count,net_snapshot,algorithm_version) VALUES ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011',1,30000,9000,2,'[]','zero-sum-dp-v1'); RAISE EXCEPTION 'expected failure: 每本仅一个正式批次'; EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END $$;
UPDATE ledgers SET status='SETTLING' WHERE id='00000000-0000-4000-8000-000000000100';
INSERT INTO settlement_transfers(id,ledger_id,batch_id,sequence,payer_member_id,payee_member_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000300',1,'00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011',3000);
INSERT INTO settlement_transfers(id,ledger_id,batch_id,sequence,payer_member_id,payee_member_id,amount_cents) VALUES ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000300',2,'00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000012',6000);
DO $$ BEGIN UPDATE settlement_transfers SET status='PAID' WHERE id='00000000-0000-4000-8000-000000000501'; RAISE EXCEPTION 'expected failure: 已还登记字段完整'; EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END $$;
UPDATE settlement_transfers SET status='PAID',registered_by_member_id='00000000-0000-4000-8000-000000000011',registered_at=now() WHERE ledger_id='00000000-0000-4000-8000-000000000100';
DO $$ DECLARE total bigint; bad integer; BEGIN
 SELECT sum(amount_cents) INTO total FROM expenses WHERE ledger_id='00000000-0000-4000-8000-000000000100' AND deleted_at IS NULL;
 IF total<>30000 THEN RAISE EXCEPTION 'expense total changed'; END IF;
 SELECT count(*) INTO bad FROM expenses e WHERE e.ledger_id='00000000-0000-4000-8000-000000000100' AND e.amount_cents<>(SELECT sum(s.amount_cents) FROM expense_splits s WHERE s.expense_id=e.id);
 IF bad<>0 THEN RAISE EXCEPTION 'split mismatch'; END IF;
 SELECT count(*) INTO bad FROM ledger_members m WHERE m.ledger_id='00000000-0000-4000-8000-000000000100' AND
 COALESCE((SELECT sum(e.amount_cents) FROM expenses e WHERE e.payer_member_id=m.id AND e.deleted_at IS NULL),0)
 - COALESCE((SELECT sum(s.amount_cents) FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE s.member_id=m.id AND e.deleted_at IS NULL),0)
 + COALESCE((SELECT sum(t.amount_cents) FROM settlement_transfers t WHERE t.payer_member_id=m.id AND t.status='PAID'),0)
 - COALESCE((SELECT sum(t.amount_cents) FROM settlement_transfers t WHERE t.payee_member_id=m.id AND t.status='PAID'),0) <> 0;
 IF bad<>0 THEN RAISE EXCEPTION 'remaining net not zero'; END IF;
END $$;
UPDATE ledgers SET status='SETTLED',settled_at=now() WHERE id='00000000-0000-4000-8000-000000000100';
UPDATE ledger_members SET archived_at=now() WHERE id='00000000-0000-4000-8000-000000000011';
DO $$ BEGIN IF (SELECT count(*) FROM ledger_members WHERE ledger_id='00000000-0000-4000-8000-000000000100' AND archived_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'personal archive'; END IF; END $$;
INSERT INTO idempotency_keys(user_id,operation,key,request_hash,response_status,response_body,expires_at) VALUES ('00000000-0000-4000-8000-000000000001','POST /ledgers/00000000-0000-4000-8000-000000000100/settle','00000000-0000-4000-8000-000000000701','0000000000000000000000000000000000000000000000000000000000000000',200,'{}',now()+interval '7 days');
DO $$ BEGIN INSERT INTO idempotency_keys SELECT * FROM idempotency_keys; RAISE EXCEPTION 'expected failure: 幂等用户操作键唯一'; EXCEPTION WHEN SQLSTATE '23505' THEN NULL; END $$;
ROLLBACK;
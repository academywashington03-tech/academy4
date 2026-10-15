-- Phase 13: fixes found by the second code review (static review; this file has NOT been executed against a database yet).
-- Safe to apply on a database that already has 0001..0010 (create or replace + idempotent revoke).

-- 1) process_online_payment: a payment transaction may belong to ONE order only.
--    Paymob's HMAC does not cover order.merchant_order_id (our order reference), and the redirect URL that the customer's browser
--    receives carries every signed field plus the HMAC. Without this guard a customer could replay ONE genuine signed callback
--    while pointing it at ANOTHER open order of the same price and total, and have that order fulfilled too.
--    The guard is atomic: INSERT .. ON CONFLICT .. DO UPDATE .. WHERE returns no row when the transaction id already belongs to
--    a different order, so two concurrent deliveries cannot both win.
create or replace function process_online_payment(
  p_provider text, p_txn_id text, p_order uuid, p_amount int, p_currency text,
  p_success boolean, p_pending boolean, p_refunded boolean, p_voided boolean, p_auth_only boolean, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare o orders; v_txn uuid;
begin
  select * into o from orders where id = p_order for update;       -- serializes concurrent webhooks
  if not found then return 'unknown_order'; end if;
  if o.method <> 'online' then return 'wrong_method'; end if;

  -- Record every callback. A later callback for the SAME transaction AND the SAME order (e.g. pending -> success) updates it.
  insert into payment_transactions (order_id, provider, provider_txn_id, provider_order_ref, amount_minor, currency, success, raw)
  values (o.id, p_provider, p_txn_id, o.provider_ref, p_amount, upper(p_currency), p_success, p_raw)
  on conflict (provider, provider_txn_id) do update
    set success = excluded.success, raw = excluded.raw
    where payment_transactions.order_id = excluded.order_id
  returning id into v_txn;
  if v_txn is null then                                             -- the transaction id is already bound to another order
    insert into audit_logs (actor_id, action, entity, entity_id, details)
      values (null, 'payment_txn_order_mismatch', 'order', o.id::text, jsonb_build_object('txn', p_txn_id, 'provider', p_provider));
    return 'txn_order_mismatch';
  end if;

  if p_refunded or p_voided then
    if o.status = 'paid' then
      update orders set status = 'refunded' where id = o.id;
      update enrollments set revoked_at = now() where order_id = o.id and revoked_at is null;
      insert into audit_logs (actor_id, action, entity, entity_id, details)
        values (null, 'order_refunded_by_provider', 'order', o.id::text, jsonb_build_object('txn', p_txn_id));
      update payment_transactions set outcome = 'refunded' where provider = p_provider and provider_txn_id = p_txn_id;
      return 'refunded';
    end if;
    return 'ignored';
  end if;
  if p_pending then return 'pending'; end if;
  if p_auth_only then return 'authorized_only'; end if;          -- funds held, not captured: no access

  if p_success then
    if p_amount <> o.total_minor or upper(p_currency) <> upper(o.currency) then
      update payment_transactions set outcome = 'amount_mismatch' where provider = p_provider and provider_txn_id = p_txn_id;
      insert into audit_logs (actor_id, action, entity, entity_id, details)
        values (null, 'payment_amount_mismatch', 'order', o.id::text,
                jsonb_build_object('expected', o.total_minor, 'got', p_amount, 'currency', p_currency));
      return 'amount_mismatch';
    end if;
    if o.status = 'refunded' then return 'ignored'; end if;
    if o.fulfilled_at is not null then
      update payment_transactions set outcome = 'duplicate' where provider = p_provider and provider_txn_id = p_txn_id;
      return 'duplicate';
    end if;
    update orders set status = 'paid', provider = p_provider where id = o.id and status in ('pending', 'failed', 'cancelled');
    perform fulfill_order(o.id, 'purchase');
    update payment_transactions set outcome = 'fulfilled' where provider = p_provider and provider_txn_id = p_txn_id;
    return 'fulfilled';
  end if;

  if o.status = 'pending' then update orders set status = 'failed' where id = o.id; end if;   -- never downgrades 'paid'
  update payment_transactions set outcome = 'failed' where provider = p_provider and provider_txn_id = p_txn_id;
  return 'failed';
end $$;
revoke all on function process_online_payment(text, text, uuid, int, text, boolean, boolean, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;

-- 2) try_issue_certificate: 0006/0007 called gen_random_bytes() with search_path = public. On Supabase the pgcrypto extension lives in
--    the "extensions" schema, so the call cannot be resolved there and EVERY certificate issue fails at run time. gen_random_uuid() is built
--    into PostgreSQL (13+) and was already used by this schema; the certificate number keeps the same shape (WA-YYYY-XXXX-XXXX-XXXX).
create or replace function try_issue_certificate(p_course uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c courses; e record; existing certificates; cert_no text; h text; tries int := 0; ins int; sname text; iname text;
begin
  if auth.uid() is null or current_role_of() is null then return null; end if;
  select * into c from courses where id = p_course and certificate_enabled;
  if not found or not has_access(p_course) then return null; end if;
  select * into existing from certificates where user_id = auth.uid() and course_id = p_course;
  if found then return case when existing.revoked_at is null then existing.certificate_no else null end; end if;
  select * into e from my_course_completion(p_course);
  if not coalesce(e.eligible, false) then return null; end if;
  select full_name into sname from profiles where id = auth.uid();
  select full_name into iname from profiles where id = c.instructor_id;
  loop
    h := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    cert_no := 'WA-' || to_char(now(), 'YYYY') || '-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
    insert into certificates (certificate_no, user_id, course_id, student_name, course_title, instructor_name)
    values (cert_no, auth.uid(), p_course, sname, c.title, iname) on conflict do nothing;
    get diagnostics ins = row_count;
    exit when ins = 1;
    select * into existing from certificates where user_id = auth.uid() and course_id = p_course;
    if found then return existing.certificate_no; end if;
    tries := tries + 1; if tries > 5 then return null; end if;
  end loop;
  perform queue_notification(auth.uid(), 'certificate', 'حصلت على شهادة إتمام', c.title, '/certificates');
  return cert_no;
end $$;
revoke all on function try_issue_certificate(uuid) from public, anon;
grant execute on function try_issue_certificate(uuid) to authenticated;

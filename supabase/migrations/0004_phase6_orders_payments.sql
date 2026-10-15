-- Phase 6: server-priced orders and idempotent online-payment fulfillment.

alter table orders add column if not exists provider text, add column if not exists provider_ref text;
alter table payment_transactions add column if not exists outcome text;
-- One open order per user+course+method: retries reuse the same order instead of piling up.
create unique index if not exists orders_one_open_per_item
  on orders (user_id, course_id, method) where status in ('pending', 'awaiting_review') and course_id is not null;

-- The price is ALWAYS computed here from the courses table. The browser never supplies an amount.
create or replace function create_order(p_course uuid, p_method payment_method) returns uuid
language plpgsql security definer set search_path = public as $$
declare c courses; o_id uuid; price int;
begin
  if auth.uid() is null or current_role_of() is null then raise exception 'not allowed'; end if;
  select * into c from courses where id = p_course and status = 'published' and enrollment_open and not is_free;
  if not found then raise exception 'course not available'; end if;
  if exists (select 1 from enrollments e where e.user_id = auth.uid() and e.course_id = p_course
             and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())) then
    raise exception 'already enrolled';
  end if;
  price := coalesce(c.promo_price_minor, c.price_minor);
  if price <= 0 then raise exception 'invalid price'; end if;
  select id into o_id from orders where user_id = auth.uid() and course_id = p_course and method = p_method
    and status in ('pending', 'awaiting_review');
  if found then
    update orders set subtotal_minor = c.price_minor, discount_minor = c.price_minor - price, total_minor = price, currency = c.currency
      where id = o_id and status = 'pending';
    return o_id;
  end if;
  insert into orders (user_id, course_id, subtotal_minor, discount_minor, total_minor, currency, method, status)
  values (auth.uid(), p_course, c.price_minor, c.price_minor - price, price, c.currency, p_method, 'pending')
  returning id into o_id;
  return o_id;
end $$;
revoke all on function create_order(uuid, payment_method) from public, anon;
grant execute on function create_order(uuid, payment_method) to authenticated;

-- Called ONLY by the webhook route with the service role, after the HMAC was verified in the app.
-- Atomic + idempotent: replays never create a second enrollment or flip a paid order back.
create or replace function process_online_payment(
  p_provider text, p_txn_id text, p_order uuid, p_amount int, p_currency text,
  p_success boolean, p_pending boolean, p_refunded boolean, p_voided boolean, p_auth_only boolean, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;       -- serializes concurrent webhooks
  if not found then return 'unknown_order'; end if;
  if o.method <> 'online' then return 'wrong_method'; end if;

  -- Record every callback. A later callback for the SAME transaction (e.g. pending -> success) updates it.
  insert into payment_transactions (order_id, provider, provider_txn_id, provider_order_ref, amount_minor, currency, success, raw)
  values (o.id, p_provider, p_txn_id, o.provider_ref, p_amount, upper(p_currency), p_success, p_raw)
  on conflict (provider, provider_txn_id) do update
    set success = excluded.success, raw = excluded.raw
    where payment_transactions.order_id = excluded.order_id;

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

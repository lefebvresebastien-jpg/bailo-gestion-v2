-- ════════════════════════════════════════════════════════════════════
-- Bailo Gestion — verrou « Offre Gratuite = 1 logement » côté base
-- À exécuter UNE fois dans le projet Supabase Gestion (nltuysmnxsomlhgvbtwz),
-- SQL Editor. Sans danger à relancer (create or replace / drop if exists).
--
-- Règle : un compte en offre Gratuite (plan = 'gratuit', ou essai 3 mois
-- expiré sans abonnement payant) ne peut pas avoir plus d'un bail non
-- terminé. Les baux déjà existants ne sont jamais touchés : seules la
-- création d'un bail supplémentaire et la réactivation d'un bail terminé
-- sont refusées. Les comptes payants et les comptes sans ligne
-- d'abonnement ne sont pas concernés.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.enforce_free_plan_lease_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free   boolean;
  v_count  integer;
  v_new_ended boolean;
  v_old_ended boolean;
begin
  v_new_ended := lower(coalesce(new.data->'formData'->>'leaseStatus', '')) in ('terminé', 'ended');
  if v_new_ended then
    return new;                       -- un bail terminé ne compte pas
  end if;

  if tg_op = 'UPDATE' then
    v_old_ended := lower(coalesce(old.data->'formData'->>'leaseStatus', '')) in ('terminé', 'ended');
    if not v_old_ended then
      return new;                     -- simple modification d'un bail déjà en cours
    end if;
  end if;

  select (s.plan = 'gratuit')
         or (s.trial is true and s.active is not true
             and s.expires_at is not null and s.expires_at < now())
    into v_free
    from public.subscriptions s
   where s.user_id::text = new.bailleur_id::text
   limit 1;

  if not coalesce(v_free, false) then
    return new;
  end if;

  select count(*) into v_count
    from public.leases l
   where l.bailleur_id::text = new.bailleur_id::text
     and l.id::text <> new.id::text
     and lower(coalesce(l.data->'formData'->>'leaseStatus', '')) not in ('terminé', 'ended');

  if v_count >= 1 then
    raise exception 'Offre Gratuite : 1 logement inclus. Passez à une offre payante pour gérer un bail supplémentaire.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_free_plan_lease_limit on public.leases;
create trigger trg_free_plan_lease_limit
  before insert or update of data on public.leases
  for each row execute function public.enforce_free_plan_lease_limit();

-- Vérification (ne modifie rien) : comptes gratuits ou en essai expiré,
-- avec leur nombre de baux en cours.
select s.email, s.plan, s.trial, s.active, s.expires_at,
       (select count(*) from public.leases l
         where l.bailleur_id::text = s.user_id::text
           and lower(coalesce(l.data->'formData'->>'leaseStatus','')) not in ('terminé','ended')) as baux_en_cours
  from public.subscriptions s
 where s.plan = 'gratuit'
    or (s.trial is true and s.active is not true and s.expires_at < now())
 order by baux_en_cours desc;

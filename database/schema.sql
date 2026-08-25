-- ============================================================================
-- ATOLL ISLE — DATABASE SCHEMA
-- Generated directly from the app script's Section 12 (Data Model).
-- Target: Postgres (Neon).
-- Tables marked [MVP] are needed for Phase 1 (script Section 13.1).
-- Tables marked [PHASE 2] can be added later without touching MVP tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
CREATE TYPE user_type AS ENUM ('tourist', 'local');
CREATE TYPE local_verification_status AS ENUM ('not_applicable', 'pending', 'verified', 'auto_reclassified');
CREATE TYPE document_type AS ENUM ('id_card', 'passport');
CREATE TYPE business_type AS ENUM ('guesthouse', 'restaurant', 'excursion', 'speedboat', 'shop');
CREATE TYPE business_account_status AS ENUM ('active', 'suspended');
CREATE TYPE business_approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE business_trust_tier AS ENUM ('new', 'graduated');
CREATE TYPE payer_type AS ENUM ('tourist', 'local', 'business');
CREATE TYPE payment_method AS ENUM ('online', 'pay_at_visit');
CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'completed');
CREATE TYPE order_status AS ENUM ('pending_payment', 'confirmed', 'ready', 'out_for_delivery', 'completed', 'cancelled');
CREATE TYPE escrow_status AS ENUM ('held', 'released', 'refunded', 'not_applicable');
CREATE TYPE check_in_status AS ENUM ('checked_in', 'pending', 'partially_checked_in');
CREATE TYPE check_in_method AS ENUM ('qr', 'manual', 'whole_group');
CREATE TYPE weather_condition_type AS ENUM ('sunny', 'cloudy', 'rainy', 'windy', 'thundery');
CREATE TYPE promo_discount_type AS ENUM ('percentage', 'fixed'); -- added alongside the promo codes backend below; the original promo_codes table had no way to tell these apart
CREATE TYPE dispute_status AS ENUM ('open', 'resolved');
CREATE TYPE admin_role AS ENUM ('admin', 'moderator');
CREATE TYPE admin_action_type AS ENUM ('approve', 'reject', 'suspend', 'reinstate', 'resolve_dispute', 'refund_override', 'mark_trusted');
CREATE TYPE admin_target_type AS ENUM ('business', 'agent', 'listing', 'booking', 'order', 'dispute');
CREATE TYPE fulfillment_method AS ENUM ('pickup', 'delivery');
CREATE TYPE handover_method AS ENUM ('buyer_pickup_at_boat', 'guesthouse_handover');
CREATE TYPE return_type AS ENUM ('return', 'exchange');
CREATE TYPE return_status AS ENUM ('requested', 'approved', 'declined', 'completed');
CREATE TYPE group_join_method AS ENUM ('qr_scan', 'contacts', 'manual', 'document_scan');
CREATE TYPE group_member_role AS ENUM ('admin', 'member');
CREATE TYPE staff_status AS ENUM ('active', 'revoked');
CREATE TYPE agent_account_status AS ENUM ('active', 'suspended');
CREATE TYPE billing_status AS ENUM ('paid', 'unpaid');

-- ---------------------------------------------------------------------------
-- [MVP] users — Section 12: User
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        TEXT NOT NULL,
    contact_email               TEXT,
    contact_mobile              TEXT NOT NULL, -- always manually entered, never OCR-sourced
    type                        user_type NOT NULL,
    local_verification_status  local_verification_status NOT NULL DEFAULT 'not_applicable',
    uploaded_document_type      document_type,
    document_image_url          TEXT, -- required to exist before any booking/order (Section 9 document-upload gate)
    document_number             TEXT,
    date_of_birth                DATE,
    language                    TEXT DEFAULT 'en', -- Tourist accounts only (Section 2.1/11)
    current_island               TEXT,
    current_stay_business_id     UUID, -- FK added after businesses table exists
    current_stay_room_number     TEXT,
    pay_at_visit_eligible        BOOLEAN NOT NULL DEFAULT false, -- [PHASE 2]
    wallet_balance                NUMERIC(12,2) NOT NULL DEFAULT 0, -- [PHASE 2]
    two_factor_secret             TEXT,
    two_factor_enabled            BOOLEAN NOT NULL DEFAULT false,
    password_hash                TEXT NOT NULL,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_type ON users(type);

-- ---------------------------------------------------------------------------
-- [PHASE 2] webauthn_credentials — biometric/platform-authenticator login
-- (fingerprint/face unlock), an additional login option alongside the
-- password + two_factor_* above, not a replacement. twoFactor.js's own
-- header comment already flagged biometric auth as "a client-side
-- (device-level) concern" it deliberately didn't cover — this is that.
-- One row per registered authenticator (a user can register more than one
-- device), keyed by the authenticator's own credential_id, not by user —
-- WebAuthn login looks up the credential first, then the user it belongs to.
-- ---------------------------------------------------------------------------
CREATE TABLE webauthn_credentials (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id        TEXT NOT NULL UNIQUE, -- base64url, from the authenticator
    public_key           TEXT NOT NULL, -- base64url-encoded COSE public key
    counter              BIGINT NOT NULL DEFAULT 0, -- signature counter, replay protection
    device_label          TEXT, -- e.g. "iPhone Face ID" — user-facing, set at registration
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at            TIMESTAMPTZ
);
CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);

-- ---------------------------------------------------------------------------
-- [MVP] businesses — Section 12: Business
-- ---------------------------------------------------------------------------
CREATE TABLE businesses (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id                    UUID NOT NULL REFERENCES users(id),
    name                             TEXT NOT NULL,
    type                             business_type NOT NULL,
    subscription_tier                TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
    subscription_expiry               TIMESTAMPTZ,
    verified_badge                   BOOLEAN NOT NULL DEFAULT false, -- Google-listing match (Section 6.4/10.4)
    approval_status                  business_approval_status NOT NULL DEFAULT 'pending',
    account_status                   business_account_status NOT NULL DEFAULT 'active',
    trust_tier                       business_trust_tier NOT NULL DEFAULT 'new', -- [PHASE 2] logic, column exists day one
    successful_pay_at_visit_count     INTEGER NOT NULL DEFAULT 0, -- [PHASE 2]
    payout_bank_details               JSONB,
    refund_fee_business_percent        NUMERIC(4,2) NOT NULL DEFAULT 5.00, -- Section 7.1/4.8
    pay_at_visit_commission_owed        NUMERIC(12,2) NOT NULL DEFAULT 0, -- [PHASE 2]
    location_island                   TEXT,
    contact_info                     JSONB,
    notification_preferences          JSONB NOT NULL DEFAULT '{"new_booking": true, "disputes": true, "messages": true}',
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_businesses_type ON businesses(type);
CREATE INDEX idx_businesses_owner ON businesses(owner_user_id);

ALTER TABLE users ADD CONSTRAINT fk_users_current_stay
    FOREIGN KEY (current_stay_business_id) REFERENCES businesses(id);

-- ---------------------------------------------------------------------------
-- [MVP] listings — Section 12: Listing (covers rooms, tables, excursion slots,
-- routes-as-tickets, and shop products via type-specific JSONB)
-- ---------------------------------------------------------------------------
CREATE TABLE listings (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id             UUID NOT NULL REFERENCES businesses(id),
    title                    TEXT NOT NULL,
    description              TEXT,
    type_specific_fields      JSONB NOT NULL DEFAULT '{}', -- room capacity, excursion duration, luggage_allowance, etc.
    tourist_price             NUMERIC(12,2) NOT NULL,
    local_price               NUMERIC(12,2) NOT NULL,
    availability_data          JSONB NOT NULL DEFAULT '{}',
    photos                    TEXT[] DEFAULT '{}',
    approval_status           business_approval_status NOT NULL DEFAULT 'pending',
    pay_at_visit_enabled       BOOLEAN NOT NULL DEFAULT false, -- [PHASE 2]; forced true while Business.trust_tier = 'new'
    -- accessibility_features: free-standing tags a business self-reports,
    -- not tied to business_type — any of 'wheelchair_accessible',
    -- 'step_free_access', 'accessible_bathroom', 'elevator_available',
    -- 'braille_signage', 'hearing_loop', 'service_animal_friendly',
    -- 'accessible_parking'. Filterable via GET /:island/listings?accessibility=.
    accessibility_features     TEXT[] NOT NULL DEFAULT '{}',
    -- shop-specific fields (NULL for non-shop listings)
    stock_count                INTEGER,
    fulfillment_options        fulfillment_method[],
    free_delivery              BOOLEAN NOT NULL DEFAULT false,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_listings_business ON listings(business_id);
CREATE INDEX idx_listings_approval ON listings(approval_status);
CREATE INDEX idx_listings_accessibility ON listings USING GIN (accessibility_features);

-- ---------------------------------------------------------------------------
-- [MVP] travel_groups + group_members — Section 12: TravelGroup
-- ---------------------------------------------------------------------------
CREATE TABLE travel_groups (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id     UUID NOT NULL REFERENCES users(id),
    group_code          TEXT NOT NULL UNIQUE, -- QR payload
    max_members          INTEGER NOT NULL DEFAULT 10,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE travel_group_members (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    travel_group_id         UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
    user_id                 UUID REFERENCES users(id), -- NULL if placeholder (not signed up yet)
    placeholder_name         TEXT,
    placeholder_mobile        TEXT,
    join_method              group_join_method NOT NULL,
    role                     group_member_role NOT NULL DEFAULT 'member',
    document_type             document_type, -- [PHASE 2] if added via document scan at signup
    document_number            TEXT,
    date_of_birth              DATE,
    passport_photo_url          TEXT, -- [PHASE 2] added at guesthouse check-in
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_member_identity CHECK (user_id IS NOT NULL OR placeholder_name IS NOT NULL)
);
CREATE INDEX idx_group_members_group ON travel_group_members(travel_group_id);

-- ---------------------------------------------------------------------------
-- [MVP] bookings — Section 12: Booking (rooms, tables, excursion slots, transfer seats)
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id                    UUID NOT NULL REFERENCES listings(id),
    user_id                       UUID NOT NULL REFERENCES users(id),
    slot_start                    TIMESTAMPTZ NOT NULL, -- explicit timezone, Asia/Male
    slot_end                      TIMESTAMPTZ,
    base_price                    NUMERIC(12,2) NOT NULL, -- business's listed price, or discounted rate if via B2B
    payer_type                    payer_type NOT NULL,
    payer_business_id              UUID REFERENCES businesses(id), -- set only when payer_type = 'business'
    payment_method                 payment_method NOT NULL DEFAULT 'online',
    business_commission             NUMERIC(12,2) NOT NULL DEFAULT 0, -- flat 1% of base_price, always deducted
    tourist_commission_applicable    BOOLEAN NOT NULL DEFAULT false,
    tourist_commission               NUMERIC(12,2) NOT NULL DEFAULT 0, -- 2% of base_price, added to charge
    price_charged                   NUMERIC(12,2) NOT NULL,
    status                          booking_status NOT NULL DEFAULT 'pending_payment',
    escrow_status                   escrow_status NOT NULL DEFAULT 'not_applicable',
    trip_id                         UUID, -- FK added after trips table exists
    cancellation_status              TEXT,
    refund_fee_applicable             BOOLEAN NOT NULL DEFAULT true,
    gross_refund_amount               NUMERIC(12,2),
    refund_app_fee                    NUMERIC(12,2),
    refund_business_credit             NUMERIC(12,2),
    refund_amount                     NUMERIC(12,2),
    check_in_status                   check_in_status NOT NULL DEFAULT 'pending',
    check_in_method                   check_in_method,
    per_member_check_in                JSONB, -- list of {member_id, checked_in: bool}
    room_number                       TEXT, -- set on check-in; drives users.current_stay_room_number
    stripe_payment_intent_id           TEXT,
    promo_code_id                     UUID, -- FK added after promo_codes table exists; set when a promo code was applied at checkout
    promo_discount_amount              NUMERIC(12,2) NOT NULL DEFAULT 0, -- deducted from price_charged only; base_price/commissions are computed pre-discount, unchanged
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_listing ON bookings(listing_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- booking_members / order_members — Section 2.2: "any group member can book
-- anything... for the whole group or a selected subset. The booking appears
-- in every included member's app, not just the booker's." One booking/order
-- row still exists (base_price/capacity/stock consumption is unchanged —
-- no per-headcount pricing or capacity model exists anywhere in this app),
-- covering the booker (bookings.user_id / orders.user_id) plus zero or more
-- fellow travel_group members recorded here so it also surfaces in their
-- own "my bookings"/"my orders" list.
CREATE TABLE booking_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    UNIQUE(booking_id, user_id)
);
CREATE INDEX idx_booking_members_user ON booking_members(user_id);
CREATE INDEX idx_booking_members_booking ON booking_members(booking_id);

-- ---------------------------------------------------------------------------
-- [MVP] orders — Section 12: Order (shop-specific)
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id                   UUID NOT NULL REFERENCES businesses(id),
    user_id                       UUID NOT NULL REFERENCES users(id),
    base_price                    NUMERIC(12,2) NOT NULL,
    payer_type                    payer_type NOT NULL,
    payer_business_id              UUID REFERENCES businesses(id),
    payment_method                 payment_method NOT NULL DEFAULT 'online',
    business_commission             NUMERIC(12,2) NOT NULL DEFAULT 0,
    tourist_commission_applicable    BOOLEAN NOT NULL DEFAULT false,
    tourist_commission               NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_charged                   NUMERIC(12,2) NOT NULL,
    fulfillment_method               fulfillment_method,
    delivery_island                  TEXT, -- [PHASE 2]
    matched_route_id                 UUID REFERENCES listings(id), -- [PHASE 2]; points at the matched speedboat LISTING (listings already exists above), not the unused `routes` table — see the note above CREATE TABLE routes for why
    delivery_fee                    NUMERIC(12,2) NOT NULL DEFAULT 0,
    handover_method                  handover_method, -- [PHASE 2]
    status                          order_status NOT NULL DEFAULT 'pending_payment',
    escrow_status                   escrow_status NOT NULL DEFAULT 'not_applicable',
    trip_id                         UUID, -- FK added after trips table exists
    refund_fee_applicable             BOOLEAN NOT NULL DEFAULT true,
    gross_refund_amount               NUMERIC(12,2),
    refund_app_fee                    NUMERIC(12,2),
    refund_business_credit             NUMERIC(12,2),
    refund_amount                     NUMERIC(12,2),
    stripe_payment_intent_id           TEXT,
    promo_code_id                     UUID, -- FK added after promo_codes table exists; set when a promo code was applied at checkout
    promo_discount_amount              NUMERIC(12,2) NOT NULL DEFAULT 0, -- deducted from price_charged only; base_price/commissions are computed pre-discount, unchanged
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_business ON orders(business_id);
CREATE INDEX idx_orders_user ON orders(user_id);

-- order_members — same group-booking-visibility purpose as booking_members
-- above, for shop orders.
CREATE TABLE order_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    UNIQUE(order_id, user_id)
);
CREATE INDEX idx_order_members_user ON order_members(user_id);
CREATE INDEX idx_order_members_order ON order_members(order_id);

CREATE TABLE order_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    listing_id       UUID NOT NULL REFERENCES listings(id),
    quantity        INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- [MVP] invoices — Section 12: Invoice
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id               UUID REFERENCES bookings(id),
    order_id                 UUID REFERENCES orders(id),
    business_id               UUID NOT NULL REFERENCES businesses(id),
    buyer_user_id             UUID REFERENCES users(id),
    payer_business_id         UUID REFERENCES businesses(id),
    service_description        TEXT NOT NULL,
    base_price                NUMERIC(12,2) NOT NULL,
    discount_applied           NUMERIC(12,2) DEFAULT 0,
    tourist_commission_line     NUMERIC(12,2) DEFAULT 0,
    total_charged              NUMERIC(12,2) NOT NULL,
    payment_method             payment_method NOT NULL,
    booking_date               TIMESTAMPTZ NOT NULL,
    payment_date               TIMESTAMPTZ,
    status                    TEXT NOT NULL DEFAULT 'confirmed', -- confirmed/cancelled/refunded/completed
    refund_breakdown            JSONB, -- {gross, fee_percent_total, net} shown only if refunded
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoice_target CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
);
CREATE INDEX idx_invoices_booking ON invoices(booking_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);

-- ---------------------------------------------------------------------------
-- [MVP] payouts — Section 12: Payout
-- ---------------------------------------------------------------------------
CREATE TABLE payouts (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id                      UUID NOT NULL REFERENCES businesses(id),
    gross_amount                     NUMERIC(12,2) NOT NULL,
    business_commission_deducted       NUMERIC(12,2) NOT NULL DEFAULT 0,
    pay_at_visit_dues_deducted          NUMERIC(12,2) NOT NULL DEFAULT 0, -- [PHASE 2]
    refund_fee_credits                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount                             NUMERIC(12,2) NOT NULL, -- what the business actually receives
    schedule_date                       DATE NOT NULL,
    status                             TEXT NOT NULL DEFAULT 'pending',
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payout_line_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id       UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
    booking_id       UUID REFERENCES bookings(id),
    order_id         UUID REFERENCES orders(id)
);

-- ---------------------------------------------------------------------------
-- [MVP] disputes — Section 12: Dispute
-- ---------------------------------------------------------------------------
CREATE TABLE disputes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id       UUID REFERENCES bookings(id),
    order_id         UUID REFERENCES orders(id),
    raised_by        TEXT NOT NULL, -- 'user' | 'business'
    raised_by_id      UUID NOT NULL,
    reason           TEXT NOT NULL,
    description       TEXT,
    photos           TEXT[] DEFAULT '{}',
    status           dispute_status NOT NULL DEFAULT 'open',
    resolution        TEXT,
    resolved_by_admin_id UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    CONSTRAINT chk_dispute_target CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- [MVP] admin_users + audit_log — Section 12: AdminUser, AuditLog
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    contact_email   TEXT NOT NULL UNIQUE,
    role           admin_role NOT NULL DEFAULT 'admin',
    status         TEXT NOT NULL DEFAULT 'active',
    password_hash   TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES admin_users(id),
    action_type     admin_action_type NOT NULL,
    target_type     admin_target_type NOT NULL,
    target_id       UUID NOT NULL,
    reason         TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);

-- ---------------------------------------------------------------------------
-- [MVP] staff_accounts — Section 12: StaffAccount
-- ---------------------------------------------------------------------------
CREATE TABLE staff_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    name           TEXT NOT NULL,
    login_email     TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    permission_level TEXT NOT NULL DEFAULT 'front_desk',
    status         staff_status NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- [MVP] trips — Section 12: Trip
-- ---------------------------------------------------------------------------
CREATE TABLE trips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trip_island_stays (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    island         TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE
);

ALTER TABLE bookings ADD CONSTRAINT fk_bookings_trip FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE orders ADD CONSTRAINT fk_orders_trip FOREIGN KEY (trip_id) REFERENCES trips(id);
CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_orders_trip ON orders(trip_id);
CREATE INDEX idx_trip_stays_trip ON trip_island_stays(trip_id);
CREATE INDEX idx_trips_user ON trips(user_id);

-- ---------------------------------------------------------------------------
-- [MVP] messages — Section 12: Message (tourist<->business chat is Phase 2,
-- but table created now so schema doesn't need a later migration)
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_key      TEXT NOT NULL, -- e.g. 'user:<id>|business:<id>'
    sender_id       UUID NOT NULL,
    sender_role     TEXT NOT NULL, -- 'user' | 'business' | 'agent'
    text           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON messages(thread_key);

-- ---------------------------------------------------------------------------
-- [MVP] notifications — backs Section 6.5's push notifications (booking
-- confirmation, boarding reminder, ETA updates). Real push delivery (FCM/APNs)
-- is a separate integration; this table is the source of truth for what
-- should be sent, and doubles as an in-app notification inbox.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type   TEXT NOT NULL, -- 'user' | 'business'
    recipient_id     UUID NOT NULL,
    type            TEXT NOT NULL, -- booking_confirmation/boarding_reminder/eta_update/dispute/new_booking/message
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    read            BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_type, recipient_id, read);

-- ---------------------------------------------------------------------------
-- [MVP] sos_alerts — Section 8.3 SOS/panic button
-- ---------------------------------------------------------------------------
CREATE TABLE sos_alerts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    latitude        NUMERIC(9,6),
    longitude        NUMERIC(9,6),
    island          TEXT,
    status         TEXT NOT NULL DEFAULT 'active', -- active/resolved
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- [MVP] alerts — Section 12: Alert
-- ---------------------------------------------------------------------------
CREATE TABLE alerts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id       UUID REFERENCES bookings(id),
    order_id         UUID REFERENCES orders(id),
    package_delivery_id UUID, -- FK added after package_deliveries table exists
    type           TEXT NOT NULL, -- delay/cancellation/eta_update/cascade_affected
    message         TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- [PHASE 2] weather_conditions — Section 12: WeatherCondition
-- ---------------------------------------------------------------------------
CREATE TABLE weather_conditions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atoll               TEXT NOT NULL,
    date                DATE NOT NULL,
    condition_type       weather_condition_type NOT NULL, -- drives line-art animation, Section 6.2
    temperature          NUMERIC(4,1),
    wind_speed           NUMERIC(5,1),
    conditions_summary    TEXT,
    UNIQUE(atoll, date)
);

-- ---------------------------------------------------------------------------
-- [PHASE 2] routes, group_bookings, package_deliveries, returns — speedboat &
-- guesthouse-arranged transfers, shop cross-island delivery
--
-- `routes` below is unpopulated and unused — per README's "Known
-- architectural gap", Phase 1 speedboat schedules actually live as generic
-- `listings` rows (business_type = 'speedboat') with origin/destination/
-- departure_times in type_specific_fields, same as the tourist-facing
-- GET /api/islands/transfers route already queries. Cross-island shop
-- delivery matching (services/deliveryMatch.js) matches against that real
-- data, so package_deliveries.route_id and orders.matched_route_id
-- reference `listings(id)`, not `routes(id)`, despite the column names.
-- group_bookings.route_id below still points at the empty `routes` table
-- since guesthouse-arranged group transfers are a separate, still-unbuilt
-- feature this pass didn't touch.
-- ---------------------------------------------------------------------------
CREATE TABLE routes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id),
    origin             TEXT NOT NULL,
    destination         TEXT NOT NULL,
    schedule           JSONB NOT NULL, -- departure times, days running, timezone Asia/Male
    capacity           INTEGER NOT NULL,
    tourist_price       NUMERIC(12,2) NOT NULL,
    local_price         NUMERIC(12,2) NOT NULL,
    luggage_allowance    JSONB -- {bags: n, weight_kg: n}
);

CREATE TABLE group_bookings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guesthouse_business_id  UUID NOT NULL REFERENCES businesses(id),
    route_id                UUID NOT NULL REFERENCES routes(id),
    payer                   TEXT NOT NULL, -- 'guesthouse' | 'tourist'
    discount_percent          NUMERIC(4,2),
    status                  TEXT NOT NULL DEFAULT 'pending',
    eta                     TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_booking_guests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_booking_id    UUID NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id),
    plain_name          TEXT,
    boarded_status       TEXT NOT NULL DEFAULT 'pending', -- boarded/no-show/pending
    resulting_booking_id UUID REFERENCES bookings(id)
);

CREATE TABLE package_deliveries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL REFERENCES orders(id),
    route_id                UUID NOT NULL REFERENCES listings(id), -- the matched speedboat listing — see the note above CREATE TABLE routes
    departure_datetime        TIMESTAMPTZ NOT NULL,
    boat_business_id          UUID NOT NULL REFERENCES businesses(id),
    handover_method           handover_method NOT NULL,
    guesthouse_business_id     UUID REFERENCES businesses(id),
    room_number               TEXT,
    notified_status           TEXT NOT NULL DEFAULT 'pending'
);

ALTER TABLE alerts ADD CONSTRAINT fk_alerts_package_delivery FOREIGN KEY (package_delivery_id) REFERENCES package_deliveries(id);

CREATE TABLE returns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL REFERENCES orders(id),
    user_id                 UUID NOT NULL REFERENCES users(id),
    reason                  TEXT NOT NULL,
    type                    return_type NOT NULL,
    status                  return_status NOT NULL DEFAULT 'requested',
    refund_fee_applicable      BOOLEAN NOT NULL DEFAULT true,
    gross_refund_amount        NUMERIC(12,2),
    refund_app_fee             NUMERIC(12,2),
    refund_business_credit      NUMERIC(12,2),
    refund_amount              NUMERIC(12,2),
    deducted_from_payout_id     UUID REFERENCES payouts(id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- [PHASE 2] B2B requests, standing discounts, agents
-- ---------------------------------------------------------------------------
CREATE TABLE standing_discounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offering_business_id  UUID NOT NULL REFERENCES businesses(id),
    partner_business_id    UUID NOT NULL REFERENCES businesses(id),
    discount_percent       NUMERIC(4,2) NOT NULL,
    UNIQUE(offering_business_id, partner_business_id)
);

CREATE TABLE b2b_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requesting_business_id  UUID NOT NULL REFERENCES businesses(id),
    receiving_business_id    UUID NOT NULL REFERENCES businesses(id),
    listing_id               UUID NOT NULL REFERENCES listings(id),
    payer                   TEXT NOT NULL, -- 'business' | 'tourist'
    room_number              TEXT,
    discount_percent          NUMERIC(4,2),
    discount_source           TEXT, -- 'live' | 'standing_rate'
    status                   TEXT NOT NULL DEFAULT 'pending',
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE b2b_request_guests (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    b2b_request_id   UUID NOT NULL REFERENCES b2b_requests(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id),
    resulting_booking_id UUID REFERENCES bookings(id)
);

CREATE TABLE agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    contact_email       TEXT NOT NULL UNIQUE,
    approval_status     business_approval_status NOT NULL DEFAULT 'pending',
    account_status      agent_account_status NOT NULL DEFAULT 'active',
    payout_bank_details   JSONB,
    password_hash        TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_connected_businesses (
    agent_id     UUID NOT NULL REFERENCES agents(id),
    business_id    UUID NOT NULL REFERENCES businesses(id),
    PRIMARY KEY (agent_id, business_id)
);

CREATE TABLE agent_bookings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    business_id          UUID NOT NULL REFERENCES businesses(id),
    listing_id           UUID NOT NULL REFERENCES listings(id),
    commission_rate      NUMERIC(4,2),
    commission_amount     NUMERIC(12,2),
    resulting_booking_id  UUID REFERENCES bookings(id),
    status               TEXT NOT NULL DEFAULT 'pending',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_booking_guests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_booking_id    UUID NOT NULL REFERENCES agent_bookings(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id),
    plain_name          TEXT
);

CREATE TABLE agent_commissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            UUID NOT NULL REFERENCES agents(id),
    agent_booking_id     UUID NOT NULL REFERENCES agent_bookings(id),
    amount              NUMERIC(12,2) NOT NULL,
    schedule_date         DATE,
    status               TEXT NOT NULL DEFAULT 'held_in_escrow' -- held_in_escrow/released/paid/voided
);

-- ---------------------------------------------------------------------------
-- [PHASE 2] reviews, document access, registration invites, subscription billing,
-- promo codes, waitlist, closures, support tickets
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    booking_id       UUID REFERENCES bookings(id),
    order_id         UUID REFERENCES orders(id),
    rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text            TEXT,
    photos          TEXT[] DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_review_target CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
);

CREATE TABLE document_access_grants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL, -- users.id or travel_group_members.id
    business_id     UUID NOT NULL REFERENCES businesses(id),
    booking_id       UUID REFERENCES bookings(id),
    order_id         UUID REFERENCES orders(id),
    granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at       TIMESTAMPTZ
);

CREATE TABLE registration_invites (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guesthouse_business_id  UUID NOT NULL REFERENCES businesses(id),
    booking_id               UUID REFERENCES bookings(id),
    prefilled_username        TEXT,
    invite_token              TEXT NOT NULL UNIQUE,
    status                   TEXT NOT NULL DEFAULT 'sent' -- sent/registered
);

CREATE TABLE subscription_billing (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id),
    billing_month        DATE NOT NULL,
    subscription_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
    pay_at_visit_dues      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_charged         NUMERIC(12,2) NOT NULL,
    status               billing_status NOT NULL DEFAULT 'unpaid',
    UNIQUE(business_id, billing_month)
);

CREATE TABLE promo_codes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    code           TEXT NOT NULL,
    discount_type   promo_discount_type NOT NULL DEFAULT 'percentage',
    discount        NUMERIC(10,2) NOT NULL, -- widened from (4,2): percentage points (0-100) or a fixed currency amount, per discount_type
    valid_from       TIMESTAMPTZ NOT NULL,
    valid_to         TIMESTAMPTZ NOT NULL,
    usage_limit      INTEGER,
    times_used       INTEGER NOT NULL DEFAULT 0,
    UNIQUE(business_id, code)
);
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_promo_code FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id);
ALTER TABLE orders ADD CONSTRAINT fk_orders_promo_code FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id);

CREATE TABLE waitlist (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL REFERENCES listings(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    requested_slot   TIMESTAMPTZ NOT NULL,
    status         TEXT NOT NULL DEFAULT 'waiting'
);

CREATE TABLE closures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason         TEXT NOT NULL
);

CREATE TABLE support_tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    business_id          UUID REFERENCES businesses(id),
    subject             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'open',
    assigned_admin_id     UUID REFERENCES admin_users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ticket_owner CHECK (user_id IS NOT NULL OR business_id IS NOT NULL)
);

CREATE TABLE support_ticket_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender          TEXT NOT NULL,
    text            TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

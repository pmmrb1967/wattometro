-- SPDX-License-Identifier: AGPL-3.0-or-later
-- More lines of the invoice in the household's contract (src/domain/tariff.ts):
-- the supplier's discount on energy (hundredths of a percent: 400 = 4 %), the
-- social tariff discounts and the social tariff financing every invoice pays
-- since 2026. Prices WITHOUT VAT in integer micro-euros, as in 0005.
ALTER TABLE tariffs ADD COLUMN energy_discount_bp INTEGER NOT NULL DEFAULT 0
  CHECK (energy_discount_bp BETWEEN 0 AND 10000);
ALTER TABLE tariffs ADD COLUMN social_energy_per_kwh INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tariffs ADD COLUMN social_power_per_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tariffs ADD COLUMN social_financing_per_kwh INTEGER NOT NULL DEFAULT 0;

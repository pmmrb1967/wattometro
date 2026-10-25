// SPDX-License-Identifier: AGPL-3.0-or-later
/** Every tool the AI may call (CLAUDE.md, "IA"), in the order they are offered. */
import { ENERGY_TOOLS } from './energy-tools';
import { GRID_TOOLS } from './grid-tools';

export const AI_TOOLS = [...ENERGY_TOOLS, ...GRID_TOOLS];

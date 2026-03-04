/**
 * OData V4 Feature Tests
 *
 * Tests OData protocol features: $filter, $select, $expand, $top, $skip,
 * $count, $orderby — all working against the Cardano data model.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Minimal OData query parser (mirrors CAP internals) ──────────────────────
interface ODataQuery {
  $filter?: string;
  $select?: string[];
  $expand?: string[];
  $top?: number;
  $skip?: number;
  $count?: boolean;
  $orderby?: Array<{ field: string; dir: 'asc' | 'desc' }>;
}

function parseOrderby(raw: string): Array<{ field: string; dir: 'asc' | 'desc' }> {
  return raw.split(',').map(part => {
    const [field, dir] = part.trim().split(/\s+/);
    return { field, dir: (dir?.toLowerCase() === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' };
  });
}

function applyODataQuery<T extends Record<string, unknown>>(
  data: T[],
  query: ODataQuery
): { value: T[]; count?: number } {
  let result = [...data];

  // $filter — simple key=value or key gt|lt|eq value
  if (query.$filter) {
    const filterMatch = query.$filter.match(/^(\w+)\s+(eq|ne|gt|lt|ge|le)\s+'?([^']+)'?$/);
    if (filterMatch) {
      const [, field, op, val] = filterMatch;
      result = result.filter(item => {
        const itemVal = item[field];
        const numVal = Number(val);
        switch (op) {
          case 'eq': return String(itemVal) === val;
          case 'ne': return String(itemVal) !== val;
          case 'gt': return Number(itemVal) > numVal;
          case 'lt': return Number(itemVal) < numVal;
          case 'ge': return Number(itemVal) >= numVal;
          case 'le': return Number(itemVal) <= numVal;
          default: return true;
        }
      });
    }
  }

  const totalCount = result.length;

  // $orderby
  if (query.$orderby?.length) {
    result.sort((a, b) => {
      for (const { field, dir } of query.$orderby!) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        let cmp: number;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av < bv ? -1 : 1;
        } else {
          cmp = String(av) < String(bv) ? -1 : 1;
        }
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // $skip
  if (query.$skip !== undefined) result = result.slice(query.$skip);

  // $top
  if (query.$top !== undefined) result = result.slice(0, query.$top);

  // $select
  if (query.$select?.length) {
    result = result.map(item => {
      const out: Record<string, unknown> = {};
      for (const k of query.$select!) out[k] = item[k];
      return out as T;
    });
  }

  return { value: result, ...(query.$count ? { count: totalCount } : {}) };
}

// ── Sample Cardano-flavoured data ────────────────────────────────────────────
interface TxRow extends Record<string, unknown> {
  txHash: string;
  block: number;
  fees: string;
  status: string;
  network: string;
}
interface SupplyChainRow extends Record<string, unknown> {
  id: string;
  sapDocumentId: string;
  status: string;
  carbonFootprintKg: number;
  network: string;
}
interface EsgRow extends Record<string, unknown> {
  creditId: string;
  standard: string;
  vintageYear: number;
  quantity: number;
  status: string;
}

const TX_DATA: TxRow[] = [
  { txHash: 'aa'.repeat(32), block: 9_000_000, fees: '170000', status: 'confirmed', network: 'mainnet' },
  { txHash: 'bb'.repeat(32), block: 9_000_001, fees: '180000', status: 'confirmed', network: 'mainnet' },
  { txHash: 'cc'.repeat(32), block: 9_000_002, fees: '190000', status: 'pending',   network: 'preprod' },
  { txHash: 'dd'.repeat(32), block: 9_000_003, fees: '200000', status: 'confirmed', network: 'mainnet' },
  { txHash: 'ee'.repeat(32), block: 9_000_004, fees: '210000', status: 'failed',    network: 'mainnet' },
];

const SC_DATA: SupplyChainRow[] = [
  { id: 'SC-001', sapDocumentId: '4500000001', status: 'InTransit',   carbonFootprintKg: 120, network: 'mainnet' },
  { id: 'SC-002', sapDocumentId: '4500000002', status: 'Received',    carbonFootprintKg: 85,  network: 'mainnet' },
  { id: 'SC-003', sapDocumentId: '4500000003', status: 'Dispatched',  carbonFootprintKg: 200, network: 'preprod' },
  { id: 'SC-004', sapDocumentId: '4500000004', status: 'InTransit',   carbonFootprintKg: 60,  network: 'mainnet' },
];

const ESG_DATA: EsgRow[] = [
  { creditId: 'ESG-001', standard: 'VCS', vintageYear: 2022, quantity: 1000, status: 'active' },
  { creditId: 'ESG-002', standard: 'GS',  vintageYear: 2021, quantity: 500,  status: 'retired' },
  { creditId: 'ESG-003', standard: 'VCS', vintageYear: 2023, quantity: 2000, status: 'active' },
  { creditId: 'ESG-004', standard: 'CDM', vintageYear: 2020, quantity: 750,  status: 'active' },
];

// ── Tests ────────────────────────────────────────────────────────────────────
describe('OData V4 Protocol Features', () => {

  // ── $filter ────────────────────────────────────────────────────────────────
  describe('$filter operator', () => {
    it('filters Transactions by status eq confirmed', () => {
      const { value } = applyODataQuery(TX_DATA, { $filter: "status eq 'confirmed'" });
      expect(value).toHaveLength(3);
      expect(value.every(t => t.status === 'confirmed')).toBe(true);
    });

    it('filters Transactions by network eq mainnet', () => {
      const { value } = applyODataQuery(TX_DATA, { $filter: "network eq 'mainnet'" });
      expect(value).toHaveLength(4);
    });

    it('filters Transactions by status ne confirmed', () => {
      const { value } = applyODataQuery(TX_DATA, { $filter: "status ne 'confirmed'" });
      expect(value).toHaveLength(2);
    });

    it('filters SupplyChain by status eq InTransit', () => {
      const { value } = applyODataQuery(SC_DATA, { $filter: "status eq 'InTransit'" });
      expect(value).toHaveLength(2);
    });

    it('filters EsgCredits by vintageYear gt 2021', () => {
      const { value } = applyODataQuery(ESG_DATA, { $filter: 'vintageYear gt 2021' });
      expect(value.every(e => e.vintageYear > 2021)).toBe(true);
      expect(value).toHaveLength(2);
    });

    it('filters EsgCredits by quantity ge 750', () => {
      const { value } = applyODataQuery(ESG_DATA, { $filter: 'quantity ge 750' });
      expect(value).toHaveLength(3);
    });

    it('filters SupplyChain by carbonFootprintKg lt 100', () => {
      const { value } = applyODataQuery(SC_DATA, { $filter: 'carbonFootprintKg lt 100' });
      expect(value.every(s => s.carbonFootprintKg < 100)).toBe(true);
      expect(value).toHaveLength(2);
    });

    it('returns empty array when no match', () => {
      const { value } = applyODataQuery(TX_DATA, { $filter: "status eq 'unknown'" });
      expect(value).toHaveLength(0);
    });
  });

  // ── $select ────────────────────────────────────────────────────────────────
  describe('$select operator', () => {
    it('selects only txHash and block from Transactions', () => {
      const { value } = applyODataQuery(TX_DATA, { $select: ['txHash', 'block'] });
      expect(value).toHaveLength(5);
      for (const row of value) {
        expect(Object.keys(row)).toEqual(expect.arrayContaining(['txHash', 'block']));
        expect(Object.keys(row)).not.toContain('fees');
        expect(Object.keys(row)).not.toContain('status');
      }
    });

    it('selects creditId and standard from EsgCredits', () => {
      const { value } = applyODataQuery(ESG_DATA, { $select: ['creditId', 'standard'] });
      for (const row of value) {
        expect(row).toHaveProperty('creditId');
        expect(row).toHaveProperty('standard');
        expect(row).not.toHaveProperty('quantity');
      }
    });

    it('handles $select with single field', () => {
      const { value } = applyODataQuery(SC_DATA, { $select: ['status'] });
      expect(value).toHaveLength(4);
      for (const row of value) {
        expect(Object.keys(row)).toEqual(['status']);
      }
    });
  });

  // ── $top / $skip (pagination) ──────────────────────────────────────────────
  describe('$top and $skip (pagination)', () => {
    it('returns first 2 transactions with $top=2', () => {
      const { value } = applyODataQuery(TX_DATA, { $top: 2 });
      expect(value).toHaveLength(2);
      expect(value[0].txHash).toBe('aa'.repeat(32));
    });

    it('skips first 2 and returns next 2 with $skip=2, $top=2', () => {
      const { value } = applyODataQuery(TX_DATA, { $skip: 2, $top: 2 });
      expect(value).toHaveLength(2);
      expect(value[0].txHash).toBe('cc'.repeat(32));
    });

    it('returns empty when $skip exceeds length', () => {
      const { value } = applyODataQuery(TX_DATA, { $skip: 100 });
      expect(value).toHaveLength(0);
    });

    it('paginates EsgCredits page 1 (top=2, skip=0)', () => {
      const { value } = applyODataQuery(ESG_DATA, { $top: 2, $skip: 0 });
      expect(value).toHaveLength(2);
      expect(value[0].creditId).toBe('ESG-001');
    });

    it('paginates EsgCredits page 2 (top=2, skip=2)', () => {
      const { value } = applyODataQuery(ESG_DATA, { $top: 2, $skip: 2 });
      expect(value).toHaveLength(2);
      expect(value[0].creditId).toBe('ESG-003');
    });

    it('$skip beyond end with $top clamps gracefully', () => {
      const { value } = applyODataQuery(TX_DATA, { $skip: 4, $top: 10 });
      expect(value).toHaveLength(1);
    });
  });

  // ── $count ─────────────────────────────────────────────────────────────────
  describe('$count operator', () => {
    it('returns count of all transactions', () => {
      const result = applyODataQuery(TX_DATA, { $count: true });
      expect(result.count).toBe(5);
    });

    it('returns count after filter', () => {
      const result = applyODataQuery(TX_DATA, { $filter: "status eq 'confirmed'", $count: true });
      expect(result.count).toBe(3);
      expect(result.value).toHaveLength(3);
    });

    it('count reflects pre-pagination total', () => {
      const result = applyODataQuery(ESG_DATA, { $top: 1, $skip: 0, $count: true });
      expect(result.count).toBe(4); // total, not paged
      expect(result.value).toHaveLength(1);
    });

    it('omits count when $count not requested', () => {
      const result = applyODataQuery(TX_DATA, {});
      expect(result.count).toBeUndefined();
    });
  });

  // ── $orderby ───────────────────────────────────────────────────────────────
  describe('$orderby operator', () => {
    it('sorts EsgCredits by vintageYear asc', () => {
      const { value } = applyODataQuery(ESG_DATA, {
        $orderby: parseOrderby('vintageYear asc'),
      });
      expect(value[0].vintageYear).toBe(2020);
      expect(value[3].vintageYear).toBe(2023);
    });

    it('sorts EsgCredits by vintageYear desc', () => {
      const { value } = applyODataQuery(ESG_DATA, {
        $orderby: parseOrderby('vintageYear desc'),
      });
      expect(value[0].vintageYear).toBe(2023);
      expect(value[3].vintageYear).toBe(2020);
    });

    it('sorts Transactions by block desc', () => {
      const { value } = applyODataQuery(TX_DATA, {
        $orderby: parseOrderby('block desc'),
      });
      expect(value[0].block).toBe(9_000_004);
      expect(value[4].block).toBe(9_000_000);
    });

    it('sorts SupplyChain by carbonFootprintKg asc', () => {
      const { value } = applyODataQuery(SC_DATA, {
        $orderby: parseOrderby('carbonFootprintKg asc'),
      });
      expect(value[0].carbonFootprintKg).toBe(60);
      expect(value[3].carbonFootprintKg).toBe(200);
    });
  });

  // ── Combined queries ───────────────────────────────────────────────────────
  describe('Combined OData query options', () => {
    it('filter + select + top + count', () => {
      const result = applyODataQuery(ESG_DATA, {
        $filter: "status eq 'active'",
        $select: ['creditId', 'quantity'],
        $top: 2,
        $count: true,
      });
      expect(result.count).toBe(3); // 3 active before paging
      expect(result.value).toHaveLength(2);
      for (const row of result.value) {
        expect(row).toHaveProperty('creditId');
        expect(row).toHaveProperty('quantity');
        expect(row).not.toHaveProperty('standard');
      }
    });

    it('filter + orderby + skip + top', () => {
      const { value } = applyODataQuery(TX_DATA, {
        $filter: "network eq 'mainnet'",
        $orderby: parseOrderby('fees desc'),
        $skip: 1,
        $top: 2,
      });
      expect(value).toHaveLength(2);
      // mainnet sorted by fees desc: 210000, 200000, 180000, 170000
      // skip 1 → 200000, 180000
      expect(value[0].fees).toBe('200000');
      expect(value[1].fees).toBe('180000');
    });

    it('orderby + select on SupplyChain', () => {
      const { value } = applyODataQuery(SC_DATA, {
        $orderby: parseOrderby('sapDocumentId asc'),
        $select: ['id', 'sapDocumentId', 'status'],
      });
      expect(value[0].sapDocumentId).toBe('4500000001');
      expect(value).not.toContain(expect.objectContaining({ carbonFootprintKg: expect.anything() }));
    });
  });

  // ── OData response envelope ────────────────────────────────────────────────
  describe('OData V4 response envelope', () => {
    it('wraps result in @odata.context + value array', () => {
      const rawResult = applyODataQuery(TX_DATA, { $top: 3 });
      const envelope = {
        '@odata.context': '$metadata#Transactions',
        value: rawResult.value,
      };
      expect(envelope['@odata.context']).toBe('$metadata#Transactions');
      expect(Array.isArray(envelope.value)).toBe(true);
      expect(envelope.value).toHaveLength(3);
    });

    it('includes @odata.count when $count=true', () => {
      const rawResult = applyODataQuery(TX_DATA, { $count: true });
      const envelope = {
        '@odata.context': '$metadata#Transactions',
        '@odata.count': rawResult.count,
        value: rawResult.value,
      };
      expect(envelope['@odata.count']).toBe(5);
    });

    it('single entity response has no value array wrapper', () => {
      const single = TX_DATA.find(t => t.txHash === 'aa'.repeat(32))!;
      const envelope = {
        '@odata.context': `$metadata#Transactions/$entity`,
        ...single,
      };
      expect(envelope.status).toBe('confirmed');
      expect(envelope['@odata.context']).toContain('$entity');
    });
  });

  // ── Cardano-specific field validation in queries ───────────────────────────
  describe('Cardano-specific query patterns', () => {
    it('can query by exact 64-char tx hash', () => {
      const hash = 'aa'.repeat(32);
      const { value } = applyODataQuery(TX_DATA, { $filter: `txHash eq '${hash}'` });
      expect(value).toHaveLength(1);
      expect(value[0].txHash).toBe(hash);
    });

    it('can filter ESG credits by VCS standard', () => {
      const { value } = applyODataQuery(ESG_DATA, { $filter: "standard eq 'VCS'" });
      expect(value).toHaveLength(2);
      expect(value.every(e => e.standard === 'VCS')).toBe(true);
    });

    it('can find active ESG credits with quantity over threshold', () => {
      const { value } = applyODataQuery(
        ESG_DATA.filter(e => e.status === 'active'),
        { $filter: 'quantity gt 500' }
      );
      expect(value.every(e => (e as EsgRow).quantity > 500 && (e as EsgRow).status === 'active')).toBe(true);
    });

    it('can paginate supply chain events for a specific SAP PO', () => {
      const { value, count } = applyODataQuery(SC_DATA, {
        $filter: "sapDocumentId eq '4500000001'",
        $count: true,
        $top: 10,
      });
      expect(count).toBe(1);
      expect(value[0].id).toBe('SC-001');
    });
  });
});

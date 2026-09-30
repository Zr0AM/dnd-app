import { withActiveOnly } from '../../../../functions/_lib/active-only';

describe('withActiveOnly', () => {
  it('adds active=1 to an empty query string', () => {
    expect(withActiveOnly('')).toBe('?active=1');
    expect(withActiveOnly('?')).toBe('?active=1');
  });

  it('preserves the other params the caller sent', () => {
    const params = new URLSearchParams(
      withActiveOnly('?sort_by=itemName&order=DESC&limit=20&offset=40&itemRarity=Very+Rare'),
    );
    expect(params.get('sort_by')).toBe('itemName');
    expect(params.get('order')).toBe('DESC');
    expect(params.get('limit')).toBe('20');
    expect(params.get('offset')).toBe('40');
    expect(params.get('itemRarity')).toBe('Very Rare');
    expect(params.get('active')).toBe('1');
  });

  it('overrides a caller-supplied active value', () => {
    expect(withActiveOnly('?active=0')).toBe('?active=1');
    expect(withActiveOnly('?active=')).toBe('?active=1');
    expect(withActiveOnly('?active=true&limit=5')).toBe('?limit=5&active=1');
  });

  it('drops repeated and differently cased active params', () => {
    const params = new URLSearchParams(withActiveOnly('?active=0&ACTIVE=0&Active=1&active=2'));
    expect(params.getAll('active')).toEqual(['1']);
    expect([...params.keys()]).toEqual(['active']);
  });

  it('keeps params that merely contain "active" in their name', () => {
    const params = new URLSearchParams(withActiveOnly('?inactive=1&activeFrom=x'));
    expect(params.get('inactive')).toBe('1');
    expect(params.get('activeFrom')).toBe('x');
    expect(params.getAll('active')).toEqual(['1']);
  });

  it('re-encodes special characters safely', () => {
    const params = new URLSearchParams(withActiveOnly('?itemName=Bag%20of%20%26%20Holding'));
    expect(params.get('itemName')).toBe('Bag of & Holding');
  });
});

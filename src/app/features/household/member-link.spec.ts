import { memberLink } from './member-link';

describe('the personal link of a member', () => {
  it('is the address of the application with the name, encoded for an address', () => {
    expect(memberLink('https://house.example', 'Celina')).toBe('https://house.example/u/Celina');
    expect(memberLink('https://house.example', 'Żaneta Łucja')).toBe(
      'https://house.example/u/%C5%BBaneta%20%C5%81ucja',
    );
    expect(memberLink('https://house.example', 'a/b')).toBe('https://house.example/u/a%2Fb');
  });
});

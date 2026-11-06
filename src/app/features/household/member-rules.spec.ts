import { FormControl } from '@angular/forms';

import {
  deviceNameProblem,
  macProblem,
  nameProblem,
  normaliseMac,
  normaliseName,
  normalisePhone,
  phoneProblem,
  problemOf,
  normaliseRequestText,
  REQUEST_TEXT_MAX_LENGTH,
  requestTextProblem,
  rule,
} from './member-rules';

describe('the rules of the household registry', () => {
  describe('a name', () => {
    it.each(['Ann', 'Aurelia', 'x'.repeat(50)])('accepts %o', (name) => {
      expect(nameProblem(name, [])).toBeUndefined();
    });

    it.each(['', 'Al', '   Al   ', 'x'.repeat(51)])('refuses %o for its length', (name) => {
      expect(nameProblem(name, [])).toBe('household.problem.nameLength');
    });

    // the registry has a unique index on the name in capitals
    it('refuses the name of another member, whatever its case', () => {
      expect(nameProblem('aurelia', ['Aurelia', 'Borys'])).toBe('household.problem.nameTaken');
      expect(nameProblem(' AURELIA ', ['Aurelia'])).toBe('household.problem.nameTaken');
    });

    it('is sent without the spaces around it', () => {
      expect(normaliseName('  Fabian ')).toBe('Fabian');
    });
  });

  describe('a phone number', () => {
    it.each(['+48500100200', '+12025550123', '+4915112345678', '+10000000'])(
      'accepts %o',
      (phone) => {
        expect(phoneProblem(phone, [])).toBeUndefined();
      },
    );

    it.each([
      '',
      '500100200',
      '0048500100200',
      '+0500100200',
      '+4850010',
      '+4850010020030040',
      '+48500abc200',
    ])('refuses %o', (phone) => {
      expect(phoneProblem(phone, [])).toBe('household.problem.phoneFormat');
    });

    it('reads a number written with spaces, dashes and brackets', () => {
      expect(normalisePhone('+48 (500) 100-200')).toBe('+48500100200');
      expect(phoneProblem('+48 500 100 200', [])).toBeUndefined();
    });

    it('refuses the number of another member, however it is written', () => {
      expect(phoneProblem('+48 500 100 200', ['+48500100200'])).toBe(
        'household.problem.phoneTaken',
      );
    });
  });

  describe('a device', () => {
    it.each(['', '   ', 'x'.repeat(51)])('refuses the name %o', (name) => {
      expect(deviceNameProblem(name, [])).toBe('household.problem.deviceName');
    });

    it('refuses a name the member already has a device of', () => {
      expect(deviceNameProblem('Phone', ['Phone'])).toBe('household.problem.deviceNameTaken');
      expect(deviceNameProblem('Watch', ['Phone'])).toBeUndefined();
    });

    it.each(['0a:1b:2c:3d:4e:5f', '0A:1B:2C:3D:4E:5F', '0a-1b-2c-3d-4e-5f', ' 0a:1b:2c:3d:4e:5f '])(
      'accepts the address %o',
      (mac) => {
        expect(macProblem(mac, [])).toBeUndefined();
        expect(normaliseMac(mac)).toBe('0a:1b:2c:3d:4e:5f');
      },
    );

    it.each(['', '0a:1b:2c:3d:4e', '0a:1b:2c:3d:4e:5g', '0a1b2c3d4e5f', '0a:1b:2c:3d:4e:5f:60'])(
      'refuses the address %o',
      (mac) => {
        expect(macProblem(mac, [])).toBe('household.problem.macFormat');
      },
    );

    it('refuses an address that is registered already, in whatever writing', () => {
      expect(macProblem('0A-1B-2C-3D-4E-5F', ['0a:1b:2c:3d:4e:5f'])).toBe(
        'household.problem.macTaken',
      );
    });
  });

  describe('as the validator of a control', () => {
    it('says nothing about a control nobody has been in', () => {
      const control = new FormControl('', {
        nonNullable: true,
        validators: rule(nameProblem, () => []),
      });

      expect(control.invalid).toBe(true);
      expect(problemOf(control)).toBeUndefined();

      control.markAsTouched();
      expect(problemOf(control)).toBe('household.problem.nameLength');
    });

    // the registry is polled under an open form
    it('follows a registry that changed while the form was open', () => {
      let others: string[] = [];
      const control = new FormControl('Fabian', {
        nonNullable: true,
        validators: rule(nameProblem, () => others),
      });
      expect(control.valid).toBe(true);

      others = ['Fabian'];
      control.updateValueAndValidity();

      expect(control.errors).toEqual({ problem: 'household.problem.nameTaken' });
    });
  });
});

// HAS-411: a copy of MemberRequestRules of database-service 0.22.0 - its cases
describe('the text of a household request', () => {
  it('takes one line of 1 to 100 characters, without the spaces around it', () => {
    expect(requestTextProblem('  Bread and milk  ')).toBeUndefined();
    expect(normaliseRequestText('  Bread and milk  ')).toBe('Bread and milk');
    expect(requestTextProblem('a'.repeat(REQUEST_TEXT_MAX_LENGTH))).toBeUndefined();
    expect(requestTextProblem('ż'.repeat(100))).toBeUndefined();
  });

  it('refuses a text of spaces only, a no-break space included', () => {
    expect(requestTextProblem('')).toBe('requests.problem.empty');
    expect(requestTextProblem('   ')).toBe('requests.problem.empty');
    expect(requestTextProblem('\u00a0\u00a0')).toBe('requests.problem.empty');
  });

  // counted in UTF-16 units, as @Size and the column of the registry
  it('refuses more than 100 characters', () => {
    expect(requestTextProblem('a'.repeat(101))).toBe('requests.problem.tooLong');
    expect(requestTextProblem('😀'.repeat(51))).toBe('requests.problem.tooLong');
  });

  it('refuses a line break, a tab or another control character inside', () => {
    expect(requestTextProblem('Bread\nmilk')).toBe('requests.problem.oneLine');
    expect(requestTextProblem('Bread\tmilk')).toBe('requests.problem.oneLine');
    expect(requestTextProblem('Bread\u2028milk')).toBe('requests.problem.oneLine');
    expect(requestTextProblem('Bread\u0007')).toBe('requests.problem.oneLine');
  });
});

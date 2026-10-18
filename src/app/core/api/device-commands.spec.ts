import { Subject, defer, of, throwError } from 'rxjs';

import { ApiError } from './api-error';
import { DeviceCommands } from './device-commands';

// HAS-232 / HAS-252: one command per device at a time, the outcome told only after the read-back
describe('DeviceCommands', () => {
  it('tells a command as sent only once the device was read again', async () => {
    const commands = new DeviceCommands<number>();
    let readBack!: () => void;
    const read = () => new Promise<void>((resolve) => (readBack = resolve));

    commands.send(1, of(undefined), read);
    expect(commands.stateOf(1)).toEqual({ sending: true });

    readBack();
    await Promise.resolve();
    await Promise.resolve();
    expect(commands.stateOf(1)).toEqual({ sending: false, sent: true });
  });

  it('sends nothing to a device whose command is still on its way', () => {
    const commands = new DeviceCommands<number>();
    const first = new Subject<void>();
    let calls = 0;
    const second = defer(() => {
      calls++;
      return of(undefined);
    });

    commands.send(1, first);
    commands.send(1, second);

    expect(calls).toBe(0);
  });

  it('keeps the failure, and reads the device again after it too', async () => {
    const commands = new DeviceCommands<number>();
    const read = vi.fn(() => Promise.resolve());

    commands.send(
      2,
      throwError(() => new ApiError('network', 0)),
      read,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(read).toHaveBeenCalledOnce();
    expect(commands.stateOf(2)?.error?.kind).toBe('network');
    expect(commands.stateOf(2)?.sending).toBe(false);
  });

  it('keeps what the answer said of the command, without a read-back told at once', () => {
    const commands = new DeviceCommands<'room', readonly string[]>();

    commands.send('room', of(['Door']));

    expect(commands.stateOf('room')).toEqual({ sending: false, sent: true, answer: ['Door'] });
  });
});

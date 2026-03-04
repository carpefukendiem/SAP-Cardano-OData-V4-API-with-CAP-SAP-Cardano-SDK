// Mock for @sap/cds — used in unit/integration tests without running a real CAP server

const cds = {
  service: {
    impl: (fn: (this: unknown) => Promise<void>) => fn,
  },
  error: (message: string, details?: unknown) => {
    const err = new Error(message);
    (err as Record<string, unknown>).details = details;
    return err;
  },
  ApplicationService: class ApplicationService {
    on(_event: string, _entity: string, _handler: unknown) {}
    before(_event: string, _entity: string, _handler: unknown) {}
    after(_event: string, _entity: string, _handler: unknown) {}
    reject(_event: string, _entity: string) {}
  },
};

module.exports = cds;
module.exports.default = cds;

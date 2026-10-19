import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { translocoTesting } from '../../testing/transloco-testing';
import { filenameOf } from './api-client';
import { CollectionTransfer } from './collection-transfer';
import { Notifier } from './notifier';

describe('filenameOf', () => {
  it('préfère le nom UTF-8, sinon le nom simple, sinon un nom par défaut', () => {
    expect(
      filenameOf(
        `attachment; filename="Boutique__co.restapi.json"; filename*=UTF-8''Boutique%20%C3%A9co.restapi.json`,
      ),
    ).toBe('Boutique éco.restapi.json');
    expect(filenameOf('attachment; filename="a.json"')).toBe('a.json');
    expect(filenameOf(null)).toBe('collection.restapi.json');
  });
});

describe('CollectionTransfer', () => {
  let http: HttpTestingController;
  let transfer: CollectionTransfer;
  const notifier = { success: vi.fn(), error: vi.fn(), failure: vi.fn() };
  const tick = () => new Promise((r) => setTimeout(r));

  beforeEach(() => {
    Object.values(notifier).forEach((f) => f.mockReset());
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: notifier },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    transfer = TestBed.inject(CollectionTransfer);
  });

  it('importe un fichier puis ouvre la nouvelle Collection', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const file = new Blob([JSON.stringify({ format: 'restapi.collection' })]);

    const importing = transfer.import(file);
    await tick();
    const req = http.expectOne('/api/collections/import');
    expect(req.request.body).toEqual({ format: 'restapi.collection' });
    req.flush({ id: 'c9', name: 'Copie' });
    await tick();
    http.expectOne('/api/collections').flush([]);
    await importing;

    expect(notifier.success).toHaveBeenCalledWith('transfer.imported', { name: 'Copie' });
    expect(navigate).toHaveBeenCalledWith(['/collections', 'c9']);
  });

  it("signale un fichier qui n'est pas du JSON, sans rien envoyer", async () => {
    await transfer.import(new Blob(['pas du json']));
    expect(notifier.failure).toHaveBeenCalledWith('transfer.invalidFile');
    http.verify();
  });

  it("télécharge l'export sous le nom proposé par le serveur", async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const exporting = transfer.export('c1');
    http.expectOne('/api/collections/c1/export').flush(new Blob(['{}']), {
      headers: { 'Content-Disposition': 'attachment; filename="c.restapi.json"' },
    });
    await exporting;

    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('c.restapi.json');
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

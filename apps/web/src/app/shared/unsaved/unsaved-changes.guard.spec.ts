import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Dialogs } from '../ui/dialogs';
import {
  discardUnsavedChanges,
  unsavedChangesGuard,
  type PendingChanges,
} from './unsaved-changes.guard';

let unsaved = false;

@Component({ template: '' })
class EditorPage implements PendingChanges {
  hasUnsavedChanges(): boolean {
    return unsaved;
  }
}

@Component({ template: '' })
class OtherPage {}

describe('unsavedChangesGuard', () => {
  let answer: boolean;
  let asked: number;
  let router: Router;

  beforeEach(async () => {
    unsaved = false;
    asked = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'editor', component: EditorPage, canDeactivate: [unsavedChangesGuard] },
          { path: 'other', component: OtherPage },
        ]),
        {
          provide: Dialogs,
          useValue: {
            confirm: async () => {
              asked++;
              return answer;
            },
          },
        },
      ],
    });
    await RouterTestingHarness.create('/editor');
    router = TestBed.inject(Router);
  });

  it('laisse partir sans rien demander quand tout est enregistré', async () => {
    expect(await router.navigateByUrl('/other')).toBe(true);
    expect(asked).toBe(0);
  });

  it('demande confirmation quand il reste des modifications, et suit la réponse', async () => {
    unsaved = true;
    answer = false;
    expect(await router.navigateByUrl('/other')).toBe(false);
    expect(router.url).toBe('/editor');
    answer = true;
    expect(await router.navigateByUrl('/other')).toBe(true);
    expect(asked).toBe(2);
  });

  it('ne demande rien quand la navigation abandonne volontairement les modifications (élément supprimé)', async () => {
    unsaved = true;
    expect(await router.navigateByUrl('/other', discardUnsavedChanges)).toBe(true);
    expect(asked).toBe(0);
  });
});

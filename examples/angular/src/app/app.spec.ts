import { Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { NotectlEditorComponent, type Plugin } from '@notectl/angular';
import { EditorInitializationAbortedError } from '@notectl/core';
import { App } from './app';

const INIT_FAILURE = new Error('Angular editor initialization failed');

@Component({
  imports: [NotectlEditorComponent],
  template: '<ntl-editor [plugins]="plugins" />',
})
class FailingEditorHost {
  readonly plugins: readonly Plugin[] = [
    {
      id: 'failing-angular-init',
      name: 'Failing Angular Init',
      init: async () => {
        throw INIT_FAILURE;
      },
    },
  ];
}

@Component({
  imports: [NotectlEditorComponent],
  template: '<ntl-editor [plugins]="plugins()" />',
})
class ReinitializingEditorHost {
  readonly plugins = signal<readonly Plugin[]>([]);

  failNextInitialization(): void {
    this.plugins.set([
      {
        id: 'failing-angular-reinit',
        name: 'Failing Angular Reinit',
        init: async () => {
          throw INIT_FAILURE;
        },
      },
    ]);
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Notectl');
  });

  it('should render subtitle', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.subtitle')?.textContent).toContain('Angular Playground');
  });

  it('rejects pending editor readiness when the fixture is destroyed', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const editors = fixture.debugElement
      .queryAll(By.directive(NotectlEditorComponent))
      .map((debugElement) => debugElement.componentInstance as NotectlEditorComponent);
    const readiness = editors.map((editor) => editor.whenReady());

    fixture.destroy();

    await Promise.all(
      readiness.map((promise) =>
        expect(promise).rejects.toBeInstanceOf(EditorInitializationAbortedError),
      ),
    );
  });
});

describe('NotectlEditorComponent initialization failures', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FailingEditorHost, ReinitializingEditorHost],
    }).compileComponents();
  });

  it('preserves real initialization failures on whenReady', async () => {
    const fixture = TestBed.createComponent(FailingEditorHost);
    fixture.detectChanges();
    const editor = fixture.debugElement.query(
      By.directive(NotectlEditorComponent),
    ).componentInstance as NotectlEditorComponent;

    await expect(editor.whenReady()).rejects.toBe(INIT_FAILURE);
    fixture.destroy();
  });

  it('owns a failed reinitialization and rejects its new ready generation', async () => {
    const fixture = TestBed.createComponent(ReinitializingEditorHost);
    fixture.detectChanges();
    const editor = fixture.debugElement.query(
      By.directive(NotectlEditorComponent),
    ).componentInstance as NotectlEditorComponent;
    await editor.whenReady();

    fixture.componentInstance.failNextInitialization();
    fixture.detectChanges();

    await expect(editor.whenReady()).rejects.toBe(INIT_FAILURE);
    fixture.destroy();
  });
});

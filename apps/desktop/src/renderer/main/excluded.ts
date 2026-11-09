// Main · Excluded sites. Tabs from these sites are never saved, grouped or sent. Only counts are
// shown, per site the user added; never a tab title.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { plural } from './format';

export interface ExcludedLocal {
  input: string;
  error: string | null;
}

export function excludedView(s: ViewState, local: ExcludedLocal): SafeHtml {
  const sites = s.settings.excludedDomains;
  const counts = s.saw.skipped.excludedByDomain;
  const list = sites.length
    ? html`<table class="tbl" style="margin-top:24px"><thead><tr><th>Site</th><th>Skipped now</th><th><span class="sr">Remove</span></th></tr></thead><tbody>${sites.map(
        (d) => html`<tr><td>${d}</td><td>${s.connection === 'connected' ? plural(counts[d] ?? 0, 'tab') : '—'}</td><td style="text-align:right"><button type="button" class="btn sm" data-act="exclude-remove" data-domain="${d}">Remove</button></td></tr>`,
      )}</tbody></table>`
    : html`<p class="quiet" style="max-width:640px;margin-top:20px">No sites excluded. Add one above — its tabs are never saved or sent.</p>`;
  return html`<h1>Excluded sites</h1>
<p class="lead">Tabs from these sites are never saved, grouped or sent anywhere. They stay open in Chrome as they are.</p>
<form class="field" style="max-width:640px" data-act="exclude-add" novalidate>
<label for="exclude-domain">Add a site</label>
<div class="row"><input id="exclude-domain" name="domain" value="${local.input}" inputmode="url" autocomplete="off" spellcheck="false" aria-describedby="exclude-help"${local.error ? html` aria-invalid="true"` : ''}><button type="submit" class="btn fill">Add</button></div>
${local.error ? html`<p class="field-error" role="alert">${local.error}</p>` : ''}
<p class="note" id="exclude-help" style="margin:6px 0 0">Example: mybank.com — covers every page on that site.</p>
</form>${list}`;
}

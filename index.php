<?php
declare(strict_types=1);

require_once __DIR__ . '/Cache.php';

class UnifiedInboxPlugin extends \RainLoop\Plugins\AbstractPlugin
{
    public const NAME = 'Unified Inbox';
    public const AUTHOR = 'Samuel Soriano';
    public const VERSION = '0.4.1';
    public const RELEASE = '2026-10-16';
    public const REQUIRED = '2.38.2';
    public const LICENSE = 'AGPL-3.0';
    public const CATEGORY = 'General';
    public const DESCRIPTION = 'Recent unread messages across your configured accounts.';

    public function Init(): void
    {
        $this->addJs('unified-inbox.js');
        $this->addCss('unified-inbox.css');
        $this->addTemplate('templates/PopupsUnifiedInbox.html');
        $this->addJsonHook('UnifiedInboxList', 'ListAccounts');
        $this->addJsonHook('UnifiedInboxSaveAccounts', 'SaveAccounts');
        $this->addJsonHook('UnifiedInboxAccount', 'AccountItems');
        $this->addJsonHook('UnifiedInboxLocate', 'Locate');
        $this->addJsonHook('UnifiedInboxMarkRead', 'MarkRead');
        $this->addJsonHook('UnifiedInboxInvalidate', 'Invalidate');
        $this->addHook('imap.before-connect', 'LimitTimeout');
    }

    protected function configMapping(): array
    {
        $properties = [];
        foreach (['days' => [14, 'Days (1–365)'], 'limit' => [50, 'Messages per account (1–200)'],
            'ttl' => [180, 'Cache seconds (0–900)']] as $name => [$default, $label]) {
            $properties[] = \RainLoop\Plugins\Property::NewInstance($name)
                ->SetType(\RainLoop\Enumerations\PluginPropertyType::INT)
                ->SetDefaultValue($default)->SetLabel($label);
        }
        return $properties;
    }

    private ?\MailSo\Imap\ImapClient $privateClient = null;

    public function LimitTimeout($account, $client, $settings): void
    {
        if ($client === $this->privateClient) $settings->timeout = 10;
    }

    private function options(): array
    {
        return [
            'days' => max(1, min(365, (int)$this->Config()->Get('plugin', 'days', 14))),
            'limit' => max(1, min(200, (int)$this->Config()->Get('plugin', 'limit', 50))),
            'ttl' => max(0, min(900, (int)$this->Config()->Get('plugin', 'ttl', 180))),
        ];
    }

    private function context(): array
    {
        $actions = $this->Manager()->Actions();
        $main = $actions->getMainAccountFromToken();
        $active = $actions->getAccountFromToken();
        if (!$main || !$active) throw new \RuntimeException('Session required');
        return [$actions, $main, $active, $actions->GetAccounts($main)];
    }

    private function account(): array
    {
        [$actions, $main, $active, $accounts] = $this->context();
        $email = (string)$this->jsonParam('email', '');
        if ($email === $main->Email()) $account = $main;
        elseif (isset($accounts[$email])) {
            $account = \RainLoop\Model\AdditionalAccount::NewInstanceFromTokenArray($actions, $accounts[$email]);
        } else throw new \RuntimeException('Account unavailable');
        if (!$account || $account->Email() !== $email) throw new \RuntimeException('Account unavailable');
        return [$actions, $main, $active, $account];
    }

    private function cache($main): \UnifiedInbox\Cache
    {
        return new \UnifiedInbox\Cache(APP_PRIVATE_DATA . 'unified-inbox', $main->Hash());
    }

    private function key($account): string
    {
        return $account->Hash() . ':' . json_encode($this->options());
    }

    private function result(string $method, callable $operation)
    {
        try {
            return $this->jsonResponse($method, ['ok' => true] + $operation());
        } catch (\Throwable $error) {
            // No upstream error text: it can contain addresses, connection data or credentials.
            return $this->jsonResponse($method, ['ok' => false, 'error' => 'unavailable']);
        }
    }

    private function imap($account, callable $operation)
    {
        $client = new \MailSo\Imap\ImapClient;
        $this->privateClient = $client;
        try {
            $account->ImapConnectAndLogin($this->Manager(), $client, $this->Manager()->Actions()->Config());
            return $operation($client);
        } finally {
            // Disconnect directly, including broken connections, without a blocking LOGOUT.
            $client->Disconnect();
            $this->privateClient = null;
        }
    }

    public function ListAccounts()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $accounts] = $this->context();
            $emails = array_values(array_unique(array_merge([$main->Email()], array_keys($accounts))));
            $stored = $actions->StorageProvider()->Get($main,
                \RainLoop\Providers\Storage\Enumerations\StorageType::CONFIG, 'unified_inbox_excluded', '[]');
            $excluded = json_decode((string)$stored, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($excluded) || !array_is_list($excluded)) throw new \RuntimeException('Invalid preferences');
            return ['accounts' => $emails, 'selected' => array_values(array_diff($emails, $excluded)),
                'active' => $active->Email(), 'options' => $this->options()];
        });
    }

    public function SaveAccounts()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $accounts] = $this->context();
            $emails = array_values(array_unique(array_merge([$main->Email()], array_keys($accounts))));
            $selected = json_decode((string)$this->jsonParam('selected', ''), false, 512, JSON_THROW_ON_ERROR);
            if (!is_array($selected) || !array_is_list($selected) || count($selected) > count($emails)) {
                throw new \RuntimeException('Invalid selection');
            }
            foreach ($selected as $email) {
                if (!is_string($email) || !in_array($email, $emails, true)) throw new \RuntimeException('Account unavailable');
            }
            // Store only exclusions: newly linked accounts are included by default.
            $excluded = array_values(array_diff($emails, $selected));
            if (!$actions->StorageProvider()->Put($main,
                \RainLoop\Providers\Storage\Enumerations\StorageType::CONFIG, 'unified_inbox_excluded',
                json_encode($excluded, JSON_THROW_ON_ERROR))) throw new \RuntimeException('Save failed');
            return [];
        });
    }

    public function AccountItems()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $account] = $this->account();
            $options = $this->options();
            $cache = $this->cache($main);
            $key = $this->key($account);
            if (!$this->jsonParam('force', false) && ($data = $cache->get($key, $options['ttl']))) {
                return $data + ['cached' => true];
            }
            $data = $this->imap($account, function ($client) use ($account, $options) {
                $folder = $client->FolderExamine('INBOX');
                $uids = $client->MessageSearch('UNSEEN SINCE ' . gmdate('d-M-Y', time() - $options['days'] * 86400));
                $total = count($uids);
                // Highest UIDs are the most recently delivered messages in this mailbox.
                rsort($uids, SORT_NUMERIC);
                $uids = array_slice($uids, 0, $options['limit']);
                $items = [];
                $rows = $uids ? $client->Fetch(['UID', 'FLAGS', 'INTERNALDATE', 'ENVELOPE'], implode(',', $uids), true) : [];
                foreach ($rows as $row) {
                    if (in_array('\\seen', array_map('strtolower', $row->GetFetchValue('FLAGS') ?: []), true)) continue;
                    $items[] = [
                        'account' => $account->Email(), 'folder' => 'INBOX',
                        'uid' => (int)$row->GetFetchValue('UID'), 'uidvalidity' => $folder->UIDVALIDITY,
                        'date' => strtotime($row->GetFetchValue('INTERNALDATE') ?: '') ?: 0,
                        'subject' => \MailSo\Base\Utils::Utf8Clear(\MailSo\Base\Utils::DecodeHeaderValue($row->GetFetchEnvelopeValue(1, ''), 'ISO-8859-1')),
                        'sender' => \MailSo\Base\Utils::Utf8Clear((string)($row->GetFetchEnvelopeEmailCollection(2, 'ISO-8859-1') ?: '')),
                        'message_id' => \MailSo\Base\Utils::Utf8Clear((string)$row->GetFetchEnvelopeValue(9, '')),
                    ];
                }
                return ['items' => \UnifiedInbox\Cache::newest($items), 'total' => $total, 'updated' => time()];
            });
            $cache->put($key, $data);
            return $data + ['cached' => false];
        });
    }

    public function Invalidate()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $account] = $this->account();
            $this->cache($main)->delete($this->key($account));
            return [];
        });
    }

    private function resolveUid($client, bool $write = false): int
    {
        $uid = max(0, (int)$this->jsonParam('uid', 0));
        $validity = (int)$this->jsonParam('uidvalidity', 0);
        $messageId = (string)$this->jsonParam('message_id', '');
        if (strlen($messageId) > 998 || preg_match('/[\r\n\x00]/', $messageId)) throw new \RuntimeException('Invalid identifier');
        $folder = $write ? $client->FolderSelect('INBOX') : $client->FolderExamine('INBOX');
        if ($write && !$folder->IsWritable) throw new \RuntimeException('Read-only mailbox');
        if ($uid > 0 && $validity > 0 && $folder->UIDVALIDITY === $validity) {
            $rows = $client->Fetch(['UID', 'ENVELOPE'], (string)$uid, true);
            foreach ($rows as $row) {
                if ((int)$row->GetFetchValue('UID') === $uid &&
                    (!$messageId || $row->GetFetchEnvelopeValue(9, '') === $messageId)) return $uid;
            }
        }
        if ($messageId !== '') {
            $matches = $client->MessageSearch('HEADER Message-ID ' . $client->EscapeString($messageId));
            if (count($matches) === 1) {
                $rows = $client->Fetch(['UID', 'ENVELOPE'], (string)$matches[0], true);
                if (count($rows) === 1 && $rows[0]->GetFetchEnvelopeValue(9, '') === $messageId) return (int)$matches[0];
            }
        }
        throw new \RuntimeException('Message moved, deleted or ambiguous');
    }

    public function Locate()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $account] = $this->account();
            if ($active->Email() !== $account->Email()) throw new \RuntimeException('Switch required');
            $located = $this->imap($account, fn($client) => $this->resolveUid($client));
            $this->cache($main)->delete($this->key($account));
            return ['folder' => 'INBOX', 'uid' => $located];
        });
    }

    public function MarkRead()
    {
        return $this->result(__FUNCTION__, function () {
            [$actions, $main, $active, $account] = $this->account();
            $cache = $this->cache($main);
            // Invalidate before mutation too: a lost response must not preserve stale metadata.
            $cache->delete($this->key($account));
            $uid = $this->imap($account, function ($client) {
                $uid = $this->resolveUid($client, true);
                $client->MessageStoreFlag(new \MailSo\Imap\SequenceSet([$uid], true),
                    ['\\Seen'], \MailSo\Imap\Enumerations\StoreAction::ADD_FLAGS_SILENT);
                $rows = $client->Fetch(['UID', 'FLAGS'], (string)$uid, true);
                foreach ($rows as $row) {
                    if ((int)$row->GetFetchValue('UID') === $uid &&
                        in_array('\\seen', array_map('strtolower', $row->GetFetchValue('FLAGS') ?: []), true)) return $uid;
                }
                throw new \RuntimeException('Read flag not confirmed');
            });
            $cache->delete($this->key($account));
            return ['uid' => $uid];
        });
    }

}

<?php
declare(strict_types=1);

namespace RainLoop\Plugins {
    abstract class AbstractPlugin {
        public array $params = [];
        public $actions;
        public function Manager() { return $this; }
        public function Actions() { return $this->actions; }
        public function Config() { return new class { public function Get($a, $b, $c) { return $c; } }; }
        protected function jsonParam($key, $default = null) { return $this->params[$key] ?? $default; }
        protected function jsonResponse($method, $data) { return $data; }
    }
}
namespace RainLoop\Providers\Storage\Enumerations {
    class StorageType { public const CONFIG = 1; }
}
namespace RainLoop\Model {
    class AdditionalAccount {
        public static function NewInstanceFromTokenArray($actions, $token) { return $token; }
    }
}
namespace MailSo\Base {
    class Utils {
        public static function DecodeHeaderValue($value, $charset) { return $value; }
        public static function Utf8Clear($value) { return $value; }
    }
}
namespace MailSo\Imap {
    class SequenceSet {
        public function __construct(public array $uids, public bool $UID) {}
    }
    class ImapClient {
        public static array $rows = [];
        public static array $matches = [];
        public static array $operations = [];
        public static int $disconnects = 0;
        public static bool $fail = false;
        public static array $writes = [];
        public static bool $writable = true;
        public function FolderSelect($folder) {
            self::$operations[] = 'SELECT';
            return (object)['UIDVALIDITY' => 7, 'IsWritable' => self::$writable];
        }
        public function MessageStoreFlag($range, $flags, $action) {
            self::$writes[] = [$range->uids, $range->UID, $flags, $action];
            foreach (self::$rows as $row) {
                if (in_array($row->uid, $range->uids, true)) $row->flags[] = '\\Seen';
            }
        }
        public function FolderExamine($folder) {
            self::$operations[] = 'EXAMINE';
            if (self::$fail) throw new \RuntimeException('offline');
            return (object)['UIDVALIDITY' => 7];
        }
        public function MessageSearch($query) { self::$operations[] = $query; return self::$matches; }
        public function Fetch($fields, $range, $uid) {
            if (!$uid || array_diff($fields, ['UID', 'FLAGS', 'INTERNALDATE', 'ENVELOPE'])) throw new \RuntimeException('Unsafe fetch');
            return self::$rows;
        }
        public function EscapeString($value) { return '"' . addcslashes($value, '"\\') . '"'; }
        public function Disconnect() { ++self::$disconnects; }
    }
}
namespace MailSo\Imap\Enumerations {
    class StoreAction { public const ADD_FLAGS_SILENT = '+FLAGS.SILENT'; }
}
namespace {
    class Account {
        public function __construct(private string $email) {}
        public function Email() { return $this->email; }
        public function Hash() { return hash('sha256', $this->email); }
        public function ImapConnectAndLogin($manager, $client, $config) {}
    }
    class Row {
        public function __construct(public int $uid, public string $id, public array $flags = []) {}
        public function GetFetchValue($field) { return match ($field) {
            'UID' => $this->uid, 'FLAGS' => $this->flags, 'INTERNALDATE' => '15-Oct-2026 10:00:00 +0000'
        }; }
        public function GetFetchEnvelopeValue($index, $default) { return $index === 9 ? $this->id : '<script>text only</script>'; }
        public function GetFetchEnvelopeEmailCollection($index, $charset) { return 'Demo <demo@example.invalid>'; }
    }
    function check(bool $ok, string $label): void {
        if (!$ok) throw new \RuntimeException($label);
        echo "OK: $label\n";
    }
    define('APP_PRIVATE_DATA', sys_get_temp_dir() . '/unified-backend-' . bin2hex(random_bytes(8)) . '/');
    require __DIR__ . '/../index.php';
    $plugin = new \UnifiedInboxPlugin;
    $plugin->actions = new class {
        public bool $loggedIn = true;
        public string $owner = 'main@example.invalid';
        public array $preferences = [];
        public bool $addAccount = false;
        public bool $saveFails = false;
        public function StorageProvider() { return $this; }
        public function Get($main, $type, $key, $default) { return $this->preferences[$main->Hash()][$key] ?? $default; }
        public function Put($main, $type, $key, $value) {
            if ($this->saveFails) return false;
            $this->preferences[$main->Hash()][$key] = $value;
            return true;
        }
        public string $active = 'main@example.invalid';
        public function getMainAccountFromToken() { return $this->loggedIn ? new Account($this->owner) : null; }
        public function getAccountFromToken() { return $this->loggedIn ? new Account($this->active) : null; }
        public function GetAccounts($main) { return ['second@example.invalid' => new Account('second@example.invalid')] + ($this->addAccount ? ['new@example.invalid' => new Account('new@example.invalid')] : []); }
        public function Config() { return null; }
    };
    try {
        check(count($plugin->ListAccounts()['accounts']) === 2, 'only linked accounts listed');
        check($plugin->ListAccounts()['selected'] === $plugin->ListAccounts()['accounts'], 'all accounts included by default');
        $plugin->params = ['selected' => '["second@example.invalid"]'];
        check($plugin->SaveAccounts()['ok'], 'save account selection');
        check($plugin->ListAccounts()['selected'] === ['second@example.invalid'], 'main account can be excluded');
        $plugin->actions->active = 'second@example.invalid';
        check($plugin->ListAccounts()['selected'] === ['second@example.invalid'], 'selection follows main account when switching');
        $plugin->actions->owner = 'other@example.invalid';
        check(count($plugin->ListAccounts()['selected']) === 2, 'preferences isolated per main user');
        $plugin->actions->owner = 'main@example.invalid';
        $plugin->actions->active = 'main@example.invalid';
        foreach (['["outsider@example.invalid"]', '{}', 'null', 'broken', '[123]', '[["second@example.invalid"]]'] as $invalid) {
            $plugin->params = ['selected' => $invalid];
            check(!$plugin->SaveAccounts()['ok'], 'invalid selection rejected');
        }
        check($plugin->ListAccounts()['selected'] === ['second@example.invalid'], 'invalid writes preserve selection');
        $plugin->params = ['selected' => '[]'];
        $plugin->actions->saveFails = true;
        check(!$plugin->SaveAccounts()['ok'], 'storage failure reported');
        $plugin->actions->saveFails = false;
        check($plugin->SaveAccounts()['ok'] && $plugin->ListAccounts()['selected'] === [], 'empty selection persists');
        $plugin->actions->addAccount = true;
        check($plugin->ListAccounts()['selected'] === ['new@example.invalid'], 'newly linked accounts included by default');
        $plugin->actions->addAccount = false;
        $plugin->actions->owner = 'main@example.invalid';
        $plugin->params = ['selected' => json_encode($plugin->ListAccounts()['accounts'])];
        check($plugin->SaveAccounts()['ok'], 'restore all accounts');
        $plugin->actions->loggedIn = false;
        check(!$plugin->SaveAccounts()['ok'], 'anonymous preferences write rejected');
        check(!$plugin->ListAccounts()['ok'], 'unauthenticated access rejected');
        $plugin->actions->loggedIn = true;
        $plugin->params = ['email' => 'outsider@example.invalid'];
        check(!$plugin->AccountItems()['ok'], 'arbitrary accounts rejected');
        $plugin->params = ['email' => 'main@example.invalid'];
        \MailSo\Imap\ImapClient::$rows = [new Row(3, '<a>'), new Row(4, '<b>', ['\\Seen'])];
        \MailSo\Imap\ImapClient::$matches = [3, 4];
        $data = $plugin->AccountItems();
        check($data['ok'] && count($data['items']) === 1 && $data['items'][0]['uidvalidity'] === 7, 'read-only metadata excludes concurrently read messages');
        check($plugin->AccountItems()['cached'], 'per-account cache hit');
        $plugin->params['force'] = 1;
        check(!$plugin->AccountItems()['cached'], 'forced refresh bypasses cache');
        check($plugin->Invalidate()['ok'], 'account invalidation');
        \MailSo\Imap\ImapClient::$rows = [new Row(3, '<a>')];
        $plugin->params += ['uid' => 3, 'uidvalidity' => 7, 'message_id' => '<a>'];
        check($plugin->Locate()['uid'] === 3, 'valid UID and mailbox generation');
        $plugin->params['uidvalidity'] = 8;
        \MailSo\Imap\ImapClient::$matches = [3];
        check($plugin->Locate()['uid'] === 3, 'Message-ID fallback after generation change');
        \MailSo\Imap\ImapClient::$matches = [3, 5];
        check(!$plugin->Locate()['ok'], 'ambiguous Message-ID rejected');
        $plugin->params['message_id'] = '';
        check(!$plugin->Locate()['ok'], 'missing identifier cannot reuse an old UID');
        $plugin->params['email'] = 'second@example.invalid';
        check(!$plugin->Locate()['ok'], 'opening requires matching active account');
        $plugin->params = ['email' => 'second@example.invalid', 'uid' => 3, 'uidvalidity' => 7, 'message_id' => '<a>'];
        check(count($plugin->AccountItems()['items']) === 1, 'inactive account cache prepared');
        check($plugin->MarkRead()['ok'], 'mark read works in a linked inactive account');
        check(\MailSo\Imap\ImapClient::$writes === [[[3], true, ['\\Seen'], '+FLAGS.SILENT']], 'only the verified UID receives the read flag');
        check($plugin->actions->active === 'main@example.invalid', 'mark read does not switch the active account');
        $afterMark = $plugin->AccountItems();
        check(!$afterMark['cached'] && !$afterMark['items'], 'mark read invalidates cached unread metadata');
        $plugin->params['uidvalidity'] = 8;
        $plugin->params['message_id'] = '';
        check(!$plugin->MarkRead()['ok'] && count(\MailSo\Imap\ImapClient::$writes) === 1, 'stale generation never writes flags');
        $plugin->params['uidvalidity'] = 7;
        \MailSo\Imap\ImapClient::$writable = false;
        check(!$plugin->MarkRead()['ok'] && count(\MailSo\Imap\ImapClient::$writes) === 1, 'read-only mailbox never writes flags');
        \MailSo\Imap\ImapClient::$writable = true;
        $plugin->params['email'] = 'outsider@example.invalid';
        check(!$plugin->MarkRead()['ok'] && count(\MailSo\Imap\ImapClient::$writes) === 1, 'unlinked account cannot write flags');
        $plugin->actions->loggedIn = false;
        check(!$plugin->MarkRead()['ok'], 'anonymous mark read rejected');
        $plugin->actions->loggedIn = true;
        $plugin->params = ['email' => 'main@example.invalid', 'force' => 1];
        \MailSo\Imap\ImapClient::$fail = true;
        $before = \MailSo\Imap\ImapClient::$disconnects;
        $result = $plugin->AccountItems();
        check(!$result['ok'] && !str_contains(json_encode($result), 'offline'), 'upstream error text never exposed');
        check(\MailSo\Imap\ImapClient::$disconnects === $before + 1, 'failed connections always closed');
    } finally {
        foreach (glob(APP_PRIVATE_DATA . 'unified-inbox/*/*') ?: [] as $file) unlink($file);
        foreach (glob(APP_PRIVATE_DATA . 'unified-inbox/*') ?: [] as $dir) rmdir($dir);
        if (is_dir(APP_PRIVATE_DATA . 'unified-inbox')) rmdir(APP_PRIVATE_DATA . 'unified-inbox');
        if (is_dir(APP_PRIVATE_DATA)) rmdir(APP_PRIVATE_DATA);
    }
}

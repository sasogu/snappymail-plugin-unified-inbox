<?php
declare(strict_types=1);
require __DIR__ . '/../Cache.php';

function check(bool $ok, string $label): void {
    if (!$ok) throw new RuntimeException($label);
    echo "OK: $label\n";
}
$root = sys_get_temp_dir() . '/unified-inbox-test-' . bin2hex(random_bytes(8));
try {
    $a = new \UnifiedInbox\Cache($root, 'owner-a');
    $b = new \UnifiedInbox\Cache($root, 'owner-b');
    $a->put('account-a', ['updated' => time(), 'items' => [['uid' => 4]]]);
    check($a->get('account-a', 180)['items'][0]['uid'] === 4, 'cache persistence');
    $a->put('malformed', ['updated' => time(), 'subject' => "invalid\xff"]);
    check($a->get('malformed', 180)['subject'] === "invalid\xef\xbf\xbd", 'malformed metadata cannot break JSON cache');
    check($b->get('account-a', 180) === null && $a->get('account-b', 180) === null, 'owner and account isolation');
    foreach (glob($root . '/*/*.json') as $file) check((fileperms($file) & 0777) === 0600, 'private files');
    check((fileperms($root) & 0777) === 0700, 'private directory');
    check($a->get('account-a', 0) === null, 'zero TTL disables reuse');
    $a->put('account-a', ['updated' => time() - 181, 'items' => []]);
    check($a->get('account-a', 180) === null, 'expired cache rejected');
    $a->put('account-a', ['updated' => time(), 'items' => []]);
    $a->delete('account-a');
    check($a->get('account-a', 180) === null, 'invalidation');
    $a->put('old-account', ['updated' => time(), 'items' => []]);
    foreach (glob($root . '/*/*.json') as $file) touch($file, time() - 3601);
    new \UnifiedInbox\Cache($root, 'owner-a');
    check(!glob($root . '/*/*.json'), 'old account metadata cleaned up');
    $rows = \UnifiedInbox\Cache::newest([
        ['date' => 10, 'uid' => 1], ['date' => 20, 'uid' => 2], ['date' => 20, 'uid' => 3]
    ]);
    check(array_column($rows, 'uid') === [3, 2, 1], 'deterministic newest-first ordering');
} finally {
    foreach (glob($root . '/*/*') ?: [] as $file) unlink($file);
    foreach (glob($root . '/*') ?: [] as $dir) rmdir($dir);
    if (is_dir($root)) rmdir($root);
}

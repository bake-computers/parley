use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use criterion::{criterion_group, criterion_main, Criterion};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use vessel::thruster::sender::ThrusterSender;

const TEST_PRIVATE_KEY: [u8; 32] = [
    0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c, 0xc4,
    0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae, 0x7f, 0x60,
];

async fn start_echo_server() -> (SocketAddr, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let counter = Arc::new(AtomicUsize::new(0));

    let c = counter.clone();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            let c = c.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 8192];
                let _ = socket.read(&mut buf).await;
                let response = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = socket.write_all(response).await;
                c.fetch_add(1, Ordering::Relaxed);
            });
        }
    });

    (addr, counter)
}

fn bench_throughput(c: &mut Criterion) {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .unwrap();

    let (addr, counter) = rt.block_on(start_echo_server());
    let target_url = format!("http://{addr}/interactions");

    let sender = ThrusterSender::new(&target_url, 1500, &TEST_PRIVATE_KEY, "bench-app")
        .expect("sender creation must succeed");

    let mut group = c.benchmark_group("thruster");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(15));

    group.bench_function("sustained_tps", |b| {
        b.iter_custom(|iters| {
            let run_secs = iters.max(1);
            let result = rt.block_on(async {
                let stats = sender.run(Duration::from_secs(run_secs)).await;
                let received = counter.load(Ordering::Relaxed);

                assert!(received > 0, "benchmark mock server received no requests");
                assert!(
                    stats.actual_tps >= 1000.0,
                    "throughput {:.1} TPS below 1000 TPS threshold",
                    stats.actual_tps
                );

                stats.duration
            });
            result
        })
    });

    group.finish();
}

criterion_group!(benches, bench_throughput);
criterion_main!(benches);

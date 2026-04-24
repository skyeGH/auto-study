/**
 * 读取 config.json 配置，自动完成视频学习
 */

const http = require('http');
const querystring = require('querystring');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// 读取配置文件
const configPath = path.join(__dirname, 'config.json');
let CONFIG;

try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    CONFIG = JSON.parse(configData);
    console.log('✅ 配置文件加载成功\n');
} catch (err) {
    console.error('❌ 读取配置文件失败:', err.message);
    console.log('请确保 config.json 文件存在且格式正确');
    process.exit(1);
}

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

/**
 * 发送进度上报请求
 */
function reportProgress(video, playduration) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const watchInfo = JSON.stringify({
            vid: video.vid,
            pid: video.pid,
            playduration: playduration,
            timestamp: timestamp
        });

        const postData = querystring.stringify({
            myClassId: CONFIG.myClassId,
            myClassCourseId: CONFIG.myClassCourseId,
            myClassCourseVideoId: video.myClassCourseVideoId,
            watchInfo: watchInfo,
            isCalculateClassHourFlag: 'true'
        });

        const options = {
            hostname: 'sddy.gxk.yxlearning.com',
            port: 80,
            path: '/train/cms/my-video/cv.gson',
            method: 'POST',
            timeout: 30000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(postData),
                'Cookie': CONFIG.cookie,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'AccountId': '5c2582a0-4d7b-42fa-b9dc-704c708c8fc0',
                'Connection': 'keep-alive',
                'Host': 'sddy.gxk.yxlearning.com',
                'Origin': 'http://sddy.gxk.yxlearning.com',
                'Referer': `http://sddy.gxk.yxlearning.com/learning/index?myClassId=${CONFIG.myClassId}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        console.log(`${colors.cyan}[${video.name}]${colors.reset} 上报: ${playduration}秒`);

        const req = http.request(options, (res) => {
            let chunks = [];
            
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                let buffer = Buffer.concat(chunks);
                
                const contentEncoding = res.headers['content-encoding'];
                if (contentEncoding === 'gzip') {
                    try {
                        buffer = zlib.gunzipSync(buffer);
                    } catch (e) {
                        console.log(`${colors.red}[${video.name}] gzip解压失败:${colors.reset}`, e.message);
                    }
                }
                
                const data = buffer.toString('utf-8');
                
                try {
                    const result = JSON.parse(data);
                    const respData = result.attribute?.data;
                    
                    if (respData?.respCode === 'SUCCESS') {
                        const match = respData.respDesc.match(/\[(\d+),(\d+),\]/);
                        const rate = respData.videoLearnRate || 0;
                        const bar = '█'.repeat(Math.floor(rate / 5)) + '░'.repeat(20 - Math.floor(rate / 5));
                        
                        if (match) {
                            const watched = parseInt(match[1]);
                            const remaining = parseInt(match[2]);
                            console.log(`${colors.green}  ✓ 成功${colors.reset} [${bar}] ${rate}% | 已看: ${watched}秒 | 剩余: ${remaining}秒`);
                        } else {
                            console.log(`${colors.green}  ✓ 成功${colors.reset} [${bar}] ${rate}%`);
                        }
                        resolve({ success: true, data: respData });
                    } else if (respData?.respCode === 'INVALID_PARAM') {
                        console.log(`${colors.yellow}  ⚠ ${respData.respDesc}${colors.reset}`);
                        resolve({ success: false, error: respData.respDesc });
                    } else {
                        console.log(`${colors.yellow}  ⚠ ${respData?.respDesc || '未知响应'}${colors.reset}`);
                        resolve({ success: false, error: respData?.respDesc });
                    }
                } catch (e) {
                    console.log(`${colors.red}  ✗ 解析失败:${colors.reset}`, data.substring(0, 100));
                    resolve({ success: false, error: 'parse_error' });
                }
            });
        });

        req.on('error', (err) => {
            console.log(`${colors.red}  ✗ 请求失败:${colors.reset}`, err.message);
            reject(err);
        });

        req.on('timeout', () => {
            console.log(`${colors.red}  ✗ 请求超时${colors.reset}`);
            req.destroy();
            reject(new Error('timeout'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 延迟函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 智能刷课 - 循环执行直到videoLearnRate达到100%
 */
async function smartStudy(video) {
    console.log(`\n${colors.magenta}========== 开始刷课: ${video.name} ==========${colors.reset}`);
    console.log(`目标: 100% | 分段: ${CONFIG.segmentSize}秒 | 间隔: ${CONFIG.delay}ms\n`);
    
    let currentTime = CONFIG.segmentSize;
    let successCount = 0;
    let failCount = 0;
    let lastRate = 0;
    
    while (true) {
        try {
            const result = await reportProgress(video, currentTime);
            if (result.success) {
                successCount++;
                lastRate = result.data.videoLearnRate || 0;
                
                // 如果已经达到100%，结束
                if (lastRate >= 100) {
                    console.log(`${colors.green}\n🎉 视频进度已达到 100%，刷课完成！${colors.reset}`);
                    break;
                }
                
                // 增加时长继续刷
                currentTime += CONFIG.segmentSize;
            } else {
                failCount++;
                console.log(`${colors.yellow}  ⚠ 请求失败，继续尝试...${colors.reset}`);
            }
        } catch (err) {
            failCount++;
            console.log(`${colors.red}  错误:${colors.reset}`, err.message);
        }
        
        process.stdout.write(`${colors.yellow}  ⏳ 等待 ${CONFIG.delay}ms...${colors.reset}\r`);
        await sleep(CONFIG.delay);
        process.stdout.write(' '.repeat(40) + '\r');
    }
    
    console.log(`${colors.green}\n✅ ${video.name} 完成! 成功:${successCount} 失败:${failCount}${colors.reset}`);
    return { successCount, failCount };
}

/**
 * 主函数
 */
async function main() {
    console.log('\n' + '='.repeat(50));
    console.log('power by 黄豆豆');
    console.log('='.repeat(50));
    console.log(`视频数量: ${CONFIG.videos.length}`);
    console.log(`目标进度: ${CONFIG.targetProgress}%`);
    console.log('='.repeat(50) + '\n');

    let totalSuccess = 0;
    let totalFail = 0;

    for (let i = 0; i < CONFIG.videos.length; i++) {
        const video = CONFIG.videos[i];
        console.log(`\n📹 处理第 ${i + 1}/${CONFIG.videos.length} 个视频`);
        
        try {
            const result = await smartStudy(video);
            totalSuccess += result.successCount;
            totalFail += result.failCount;
            
            if (i < CONFIG.videos.length - 1) {
                console.log(`\n${colors.yellow}⏭  等待 ${CONFIG.delay}ms 后处理下一个视频...${colors.reset}`);
                await sleep(CONFIG.delay);
            }
        } catch (err) {
            console.error(`${colors.red}处理视频失败:${colors.reset}`, err);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('           🎉 所有视频处理完成!');
    console.log(`           总成功: ${totalSuccess} | 总失败: ${totalFail}`);
    console.log('='.repeat(50) + '\n');
    
    console.log('5秒后自动退出...');
    setTimeout(() => process.exit(0), 5000);
}

// 运行
main().catch(err => {
    console.error('程序错误:', err);
    process.exit(1);
});

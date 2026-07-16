const fs = require('fs');
const path = require('path');

const CONTEXTS = [
    { slug: 'healthcare', label: 'Healthcare', tag: 'healthcare' },
    { slug: 'fintech', label: 'Fintech', tag: 'finance' },
    { slug: 'retail', label: 'Retail', tag: 'retail' },
    { slug: 'climate', label: 'Climate', tag: 'climate' },
    { slug: 'robotics', label: 'Robotics', tag: 'robotics' },
    { slug: 'language', label: 'Language', tag: 'nlp' },
    { slug: 'vision', label: 'Vision', tag: 'computer-vision' },
];

function rngFor(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function integer(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
}

function rounded(value, digits = 8) {
    if (Array.isArray(value)) return value.map((item) => rounded(item, digits));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item, digits)]));
    }
    if (typeof value !== 'number') return value;
    const clean = Number(value.toFixed(digits));
    return Object.is(clean, -0) ? 0 : clean;
}

function output(value) {
    return JSON.stringify(rounded(value));
}

function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function minmax(values) {
    const low = Math.min(...values);
    const high = Math.max(...values);
    return high === low ? values.map(() => 0) : values.map((value) => (value - low) / (high - low));
}

function zscore(values) {
    const center = mean(values);
    const deviation = Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
    return deviation === 0 ? values.map(() => 0) : values.map((value) => (value - center) / deviation);
}

function accuracy({ y_true: truth, y_pred: prediction }) {
    return truth.filter((value, index) => value === prediction[index]).length / truth.length;
}

function binaryF1({ y_true: truth, y_pred: prediction }) {
    let tp = 0; let fp = 0; let fn = 0;
    truth.forEach((value, index) => {
        if (value === 1 && prediction[index] === 1) tp += 1;
        else if (value === 0 && prediction[index] === 1) fp += 1;
        else if (value === 1 && prediction[index] === 0) fn += 1;
    });
    return 2 * tp / (2 * tp + fp + fn) || 0;
}

function squaredDistance(left, right) {
    return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
}

function knn({ X_train: train, y_train: labels, X_test: test, k }) {
    return test.map((row) => {
        const neighbours = train.map((candidate, index) => ({
            distance: squaredDistance(row, candidate), label: labels[index], index,
        })).sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, k);
        const votes = new Map();
        neighbours.forEach(({ label }) => votes.set(label, (votes.get(label) || 0) + 1));
        return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    });
}

function linearRegression({ x, y }) {
    const xMean = mean(x); const yMean = mean(y);
    const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
    const slope = denominator === 0 ? 0 : x.reduce(
        (sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0
    ) / denominator;
    return { slope, intercept: yMean - slope * xMean };
}

function entropy({ labels }) {
    const counts = new Map();
    labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
    return [...counts.values()].reduce((total, count) => {
        const probability = count / labels.length;
        return total - probability * Math.log2(probability);
    }, 0);
}

function rocAuc({ y_true: truth, scores }) {
    const ordered = scores.map((score, index) => ({ score, label: truth[index] }))
        .sort((a, b) => a.score - b.score);
    let rankSum = 0; let cursor = 0;
    while (cursor < ordered.length) {
        let end = cursor + 1;
        while (end < ordered.length && ordered[end].score === ordered[cursor].score) end += 1;
        const averageRank = (cursor + 1 + end) / 2;
        for (let index = cursor; index < end; index += 1) if (ordered[index].label === 1) rankSum += averageRank;
        cursor = end;
    }
    const positives = truth.filter((value) => value === 1).length;
    const negatives = truth.length - positives;
    return (rankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

function cosineTopK({ query, candidates, k }) {
    const queryNorm = Math.sqrt(query.reduce((sum, value) => sum + value ** 2, 0));
    return candidates.map((candidate, index) => {
        const norm = Math.sqrt(candidate.reduce((sum, value) => sum + value ** 2, 0));
        const dot = candidate.reduce((sum, value, offset) => sum + value * query[offset], 0);
        return { index, score: queryNorm && norm ? dot / (queryNorm * norm) : 0 };
    }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, k).map((item) => item.index);
}

function polynomialFeatures({ values, degree }) {
    return values.map((value) => Array.from({ length: degree }, (_, index) => value ** (index + 1)));
}

function kmeans({ points, k, iterations }) {
    let centers = points.slice(0, k).map((point) => [...point]);
    for (let step = 0; step < iterations; step += 1) {
        const groups = Array.from({ length: k }, () => []);
        points.forEach((point) => {
            let best = 0;
            for (let index = 1; index < centers.length; index += 1) {
                if (squaredDistance(point, centers[index]) < squaredDistance(point, centers[best])) best = index;
            }
            groups[best].push(point);
        });
        centers = centers.map((center, index) => groups[index].length === 0 ? center : center.map(
            (_, dimension) => mean(groups[index].map((point) => point[dimension]))
        ));
    }
    return centers;
}

function logisticGd({ X, y, lr, epochs }) {
    const weights = Array(X[0].length).fill(0); let bias = 0;
    for (let epoch = 0; epoch < epochs; epoch += 1) {
        const grad = Array(weights.length).fill(0); let biasGrad = 0;
        X.forEach((row, index) => {
            const score = row.reduce((sum, value, offset) => sum + value * weights[offset], bias);
            const prediction = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, score))));
            const error = prediction - y[index];
            row.forEach((value, offset) => { grad[offset] += error * value; });
            biasGrad += error;
        });
        weights.forEach((_, index) => { weights[index] -= lr * grad[index] / X.length; });
        bias -= lr * biasGrad / X.length;
    }
    return { weights, bias };
}

function dbscan1d({ values, eps, min_samples: minSamples }) {
    const labels = Array(values.length).fill(undefined); let cluster = 0;
    const neighbours = (index) => values.map((value, other) => Math.abs(value - values[index]) <= eps ? other : -1)
        .filter((indexValue) => indexValue >= 0);
    for (let index = 0; index < values.length; index += 1) {
        if (labels[index] !== undefined) continue;
        const seeds = neighbours(index);
        if (seeds.length < minSamples) { labels[index] = -1; continue; }
        labels[index] = cluster;
        const queue = [...seeds];
        while (queue.length) {
            const candidate = queue.shift();
            if (labels[candidate] === -1) labels[candidate] = cluster;
            if (labels[candidate] !== undefined) continue;
            labels[candidate] = cluster;
            const expanded = neighbours(candidate);
            if (expanded.length >= minSamples) expanded.forEach((item) => {
                if (!queue.includes(item)) queue.push(item);
            });
        }
        cluster += 1;
    }
    return labels;
}

function viterbi({ observations, start, transition, emission }) {
    let scores = start.map((value, state) => Math.log(value) + Math.log(emission[state][observations[0]]));
    const parents = [];
    for (let time = 1; time < observations.length; time += 1) {
        const next = []; const back = [];
        for (let state = 0; state < start.length; state += 1) {
            const candidates = scores.map((score, previous) => score + Math.log(transition[previous][state]));
            let best = 0;
            for (let previous = 1; previous < candidates.length; previous += 1) if (candidates[previous] > candidates[best]) best = previous;
            next[state] = candidates[best] + Math.log(emission[state][observations[time]]);
            back[state] = best;
        }
        scores = next; parents.push(back);
    }
    let state = scores.indexOf(Math.max(...scores)); const pathResult = [state];
    for (let time = parents.length - 1; time >= 0; time -= 1) { state = parents[time][state]; pathResult.push(state); }
    return pathResult.reverse();
}

function pagerank({ adjacency, damping, iterations }) {
    const size = adjacency.length; let ranks = Array(size).fill(1 / size);
    for (let step = 0; step < iterations; step += 1) {
        const next = Array(size).fill((1 - damping) / size);
        adjacency.forEach((edges, source) => {
            if (edges.length === 0) {
                for (let target = 0; target < size; target += 1) next[target] += damping * ranks[source] / size;
            } else edges.forEach((target) => { next[target] += damping * ranks[source] / edges.length; });
        });
        ranks = next;
    }
    return ranks;
}

function ndcg({ relevance, ranking, k }) {
    const dcg = ranking.slice(0, k).reduce(
        (sum, item, index) => sum + (2 ** relevance[item] - 1) / Math.log2(index + 2), 0
    );
    const ideal = [...relevance].sort((a, b) => b - a).slice(0, k).reduce(
        (sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0
    );
    return ideal ? dcg / ideal : 0;
}

function numericValues(random, index, variant) {
    const length = 3 + (index % 8);
    if (index % 11 === 0) return Array(length).fill(variant - 3);
    return Array.from({ length }, () => integer(random, -20, 30) + variant);
}

const TEMPLATES = [
    {
        id: 'feature-mean', title: 'Feature Mean', difficulty: 'Easy', tags: ['statistics', 'preprocessing'],
        summary: 'Compute the arithmetic mean of one numeric feature.',
        description: 'Return the arithmetic mean of payload.values. The list is always non-empty.',
        constraints: ['1 <= len(values) <= 10000', 'Values are finite numbers.'],
        hints: ['Accumulate one sum.', 'Divide by the number of values.'],
        editorial: ['Sum every value once, then divide by n.', 'O(n)', 'O(1)', ['Integer division.', 'Dividing by the wrong count.']],
        make: (random, index, variant) => ({ values: numericValues(random, index, variant) }),
        solve: ({ values }) => mean(values),
    },
    {
        id: 'robust-median', title: 'Robust Median', difficulty: 'Easy', tags: ['statistics', 'robustness'],
        summary: 'Find the median of an unsorted numeric feature.',
        description: 'Return the median of payload.values. Average the two middle values for even lengths.',
        constraints: ['1 <= len(values) <= 10000', 'Do not assume the input is sorted.'],
        hints: ['Sort a copy.', 'Handle odd and even lengths separately.'],
        editorial: ['Sort and select the middle value or pair.', 'O(n log n)', 'O(n)', ['Mutating caller data.', 'Off-by-one on even lengths.']],
        make: (random, index, variant) => ({ values: numericValues(random, index + 1, variant) }),
        solve: ({ values }) => median(values),
    },
    {
        id: 'minmax-scale', title: 'Min-Max Scaling', difficulty: 'Easy', tags: ['preprocessing', 'normalization'],
        summary: 'Scale a feature into the unit interval.',
        description: 'Return min-max scaled payload.values. Return all zeros when the feature is constant.',
        constraints: ['1 <= len(values) <= 10000', 'Preserve input order.'],
        hints: ['Compute min and max once.', 'Guard max == min.'],
        editorial: ['Apply (x-min)/(max-min) to each value.', 'O(n)', 'O(n)', ['Division by zero.', 'Reordering values.']],
        make: (random, index, variant) => ({ values: numericValues(random, index, variant) }),
        solve: ({ values }) => minmax(values),
    },
    {
        id: 'zscore-standardize', title: 'Z-Score Standardization', difficulty: 'Easy', tags: ['preprocessing', 'statistics'],
        summary: 'Standardize a feature with population variance.',
        description: 'Return z-scores for payload.values using population standard deviation. Constant features map to zeros.',
        constraints: ['1 <= len(values) <= 10000', 'Use population variance (divide by n).'],
        hints: ['Compute the mean first.', 'Use sqrt(mean((x-mean)^2)).'],
        editorial: ['Center, compute population deviation, then scale.', 'O(n)', 'O(n)', ['Using sample variance.', 'Constant columns.']],
        make: (random, index, variant) => ({ values: numericValues(random, index, variant) }),
        solve: ({ values }) => zscore(values),
    },
    {
        id: 'classification-accuracy', title: 'Classification Accuracy', difficulty: 'Easy', tags: ['metrics', 'classification'],
        summary: 'Measure exact-label classification accuracy.',
        description: 'Return the fraction of matching positions in payload.y_true and payload.y_pred.',
        constraints: ['1 <= len(y_true) == len(y_pred) <= 100000', 'Labels are integers.'],
        hints: ['Compare paired labels.', 'Divide matches by total.'],
        editorial: ['Count exact matches in one pass.', 'O(n)', 'O(1)', ['Returning a percentage instead of a fraction.']],
        make: (random, index) => {
            const size = 5 + (index % 12); const truth = Array.from({ length: size }, () => integer(random, 0, 3));
            return { y_true: truth, y_pred: truth.map((value, offset) => offset % 3 === index % 3 ? (value + 1) % 4 : value) };
        },
        solve: accuracy,
    },
    {
        id: 'binary-f1', title: 'Binary F1 Score', difficulty: 'Easy', tags: ['metrics', 'classification'],
        summary: 'Compute F1 for the positive class.',
        description: 'Return binary F1 for payload.y_true and payload.y_pred, treating 1 as positive. Return 0 for a zero denominator.',
        constraints: ['1 <= len(y_true) == len(y_pred) <= 100000', 'Labels are 0 or 1.'],
        hints: ['Count TP, FP, and FN.', 'Use 2TP/(2TP+FP+FN).'],
        editorial: ['Derive the harmonic mean directly from confusion counts.', 'O(n)', 'O(1)', ['Ignoring the zero-positive case.']],
        make: (random, index) => {
            const size = 6 + (index % 15); const truth = Array.from({ length: size }, () => integer(random, 0, 1));
            return { y_true: truth, y_pred: truth.map((value, offset) => offset % 4 === index % 4 ? 1 - value : value) };
        },
        solve: binaryF1,
    },
    {
        id: 'knn-classifier', title: 'Deterministic KNN', difficulty: 'Medium', tags: ['classification', 'knn'],
        summary: 'Predict labels with Euclidean nearest neighbours.',
        description: 'Return predictions for payload.X_test using Euclidean KNN over X_train. Break vote ties with the smallest label.',
        constraints: ['1 <= k <= len(X_train) <= 2000', 'All rows share one dimension.'],
        hints: ['Compute squared distance; sqrt is unnecessary.', 'Sort by distance and original index.', 'Count votes deterministically.'],
        editorial: ['For each query, rank training rows and vote among the first k.', 'O(q*n log n*d)', 'O(n)', ['Non-deterministic ties.', 'Mixing train and test rows.']],
        make: (random, index, variant) => {
            const dimension = 2 + index % 3; const size = 7 + index % 6;
            const train = Array.from({ length: size }, () => Array.from({ length: dimension }, () => integer(random, -8, 8) + variant));
            return { X_train: train, y_train: train.map((row) => row.reduce((a, b) => a + b, 0) >= dimension * variant ? 1 : 0), X_test: Array.from({ length: 1 + index % 3 }, () => Array.from({ length: dimension }, () => integer(random, -8, 8) + variant)), k: 1 + index % Math.min(5, size) };
        },
        solve: knn,
    },
    {
        id: 'ols-regression', title: 'Closed-Form Linear Regression', difficulty: 'Medium', tags: ['regression', 'statistics'],
        summary: 'Fit a one-feature least-squares line.',
        description: 'Return {slope, intercept} for ordinary least squares over payload.x and payload.y. For constant x, use slope 0 and intercept mean(y).',
        constraints: ['2 <= len(x) == len(y) <= 100000', 'Values are finite.'],
        hints: ['Center x and y.', 'slope = covariance/variance.'],
        editorial: ['Use centered sums to compute the least-squares coefficients.', 'O(n)', 'O(1)', ['Forgetting the intercept.', 'Constant x.']],
        make: (random, index, variant) => {
            const size = 5 + index % 10; const slope = (variant % 5) - 2 || 1; const intercept = variant - 3;
            const shift = index / 10;
            const x = index % 17 === 0
                ? Array(size).fill(variant + shift)
                : Array.from({ length: size }, (_, offset) => offset - 2 + shift);
            return { x, y: x.map((value) => slope * value + intercept) };
        },
        solve: linearRegression,
    },
    {
        id: 'label-entropy', title: 'Label Entropy', difficulty: 'Medium', tags: ['decision-trees', 'information-theory'],
        summary: 'Measure label uncertainty in bits.',
        description: 'Return Shannon entropy base 2 for payload.labels.',
        constraints: ['1 <= len(labels) <= 100000', 'Labels are integers.'],
        hints: ['Count each class.', 'Sum -p*log2(p).'],
        editorial: ['Convert class frequencies to probabilities and accumulate entropy.', 'O(n)', 'O(c)', ['Using natural logarithms.', 'Including absent classes.']],
        make: (random, index, variant) => ({ labels: Array.from({ length: 6 + index % 20 }, () => integer(random, 0, 2 + variant % 3)) }),
        solve: entropy,
    },
    {
        id: 'roc-auc', title: 'ROC AUC with Ties', difficulty: 'Medium', tags: ['metrics', 'ranking'],
        summary: 'Compute binary ROC AUC from scores.',
        description: 'Return ROC AUC for payload.y_true and payload.scores using average ranks for tied scores.',
        constraints: ['Both classes are present.', '1 <= len(scores) <= 100000.'],
        hints: ['Sort scores ascending.', 'Give ties their average rank.', 'Use the Mann-Whitney formula.'],
        editorial: ['Average tied ranks, sum positive ranks, then normalize.', 'O(n log n)', 'O(n)', ['Breaking ties arbitrarily.', 'Sorting labels without scores.']],
        make: (random, index) => {
            const size = 8 + (index % 14); const truth = Array.from({ length: size }, (_, offset) => offset % 2);
            return { y_true: truth, scores: truth.map((label, offset) => Math.round((label * 0.6 + random() * 0.7 + (offset % 3) * 0.05) * 10) / 10) };
        },
        solve: rocAuc,
    },
    {
        id: 'cosine-retrieval', title: 'Cosine Top-K Retrieval', difficulty: 'Medium', tags: ['recommendation', 'retrieval'],
        summary: 'Rank candidate embeddings by cosine similarity.',
        description: 'Return indices of the k most cosine-similar payload.candidates to payload.query. Break ties by smaller index.',
        constraints: ['1 <= k <= len(candidates)', 'All vectors share one dimension.'],
        hints: ['Compute dot products and norms.', 'A zero vector has similarity 0.'],
        editorial: ['Score every candidate, then sort by descending similarity and index.', 'O(n*d+n log n)', 'O(n)', ['Not handling zero norms.', 'Unstable ties.']],
        make: (random, index, variant) => {
            const dimension = 3 + index % 3; const count = 6 + index % 8;
            return { query: Array.from({ length: dimension }, () => integer(random, -4, 5) + variant % 2), candidates: Array.from({ length: count }, () => Array.from({ length: dimension }, () => integer(random, -5, 5))), k: 1 + index % Math.min(5, count) };
        },
        solve: cosineTopK,
    },
    {
        id: 'polynomial-features', title: 'Polynomial Feature Expansion', difficulty: 'Medium', tags: ['feature-engineering', 'regression'],
        summary: 'Expand scalar values into polynomial powers.',
        description: 'For each x in payload.values return [x, x^2, ..., x^degree].',
        constraints: ['1 <= degree <= 6', '1 <= len(values) <= 10000.'],
        hints: ['Build one row per value.', 'Powers start at one.'],
        editorial: ['Generate consecutive powers for every scalar.', 'O(n*degree)', 'O(n*degree)', ['Including a bias column.', 'Starting at x^0.']],
        make: (random, index, variant) => ({ values: Array.from({ length: 3 + index % 6 }, () => integer(random, -4, 4) + variant % 2), degree: 2 + index % 4 }),
        solve: polynomialFeatures,
    },
    {
        id: 'kmeans-centroids', title: 'K-Means Centroid Updates', difficulty: 'Hard', tags: ['clustering', 'optimization'],
        summary: 'Run deterministic K-Means updates.',
        description: 'Initialize centers with the first k points, run payload.iterations assignment/update rounds, and return centers. Ties choose the smaller center index; empty clusters keep their center.',
        constraints: ['2 <= k <= 4', '2 <= dimensions <= 5', '1 <= iterations <= 20.'],
        hints: ['Keep assignment deterministic.', 'Update each coordinate by its cluster mean.', 'Preserve empty centers.'],
        editorial: ['Alternate nearest-center assignment and coordinate-wise means.', 'O(iterations*n*k*d)', 'O(n+k*d)', ['Reinitializing centers.', 'Dropping empty clusters.']],
        make: (random, index, variant) => {
            const k = 2 + index % 2; const dimension = 2 + index % 2;
            const anchors = Array.from({ length: k }, (_, cluster) => Array.from({ length: dimension }, (_, axis) => cluster * 8 + axis + variant));
            const points = anchors.map((anchor) => [...anchor]);
            for (let cluster = 0; cluster < k; cluster += 1) for (let item = 0; item < 4 + index % 4; item += 1) points.push(anchors[cluster].map((value) => value + integer(random, -2, 2)));
            return { points, k, iterations: 3 + index % 5 };
        },
        solve: kmeans,
    },
    {
        id: 'logistic-gradient', title: 'Logistic Regression Gradient Descent', difficulty: 'Hard', tags: ['classification', 'optimization'],
        summary: 'Train binary logistic regression from scratch.',
        description: 'Starting from zero weights and bias, run full-batch gradient descent and return {weights, bias}. Clip logits to [-30, 30] before sigmoid.',
        constraints: ['2 <= features <= 4', '1 <= epochs <= 200', '0 < lr <= 0.5.'],
        hints: ['sigmoid(z)=1/(1+exp(-z)).', 'Average gradients over rows.', 'Update weights and bias together.'],
        editorial: ['Accumulate cross-entropy gradients for a full batch each epoch.', 'O(epochs*n*d)', 'O(d)', ['Using squared-error gradients.', 'Updating inside the row loop.']],
        make: (random, index, variant) => {
            const dimension = 2 + index % 2; const size = 10 + index % 8;
            const X = Array.from({ length: size }, () => Array.from({ length: dimension }, () => integer(random, -4, 4)));
            return { X, y: X.map((row) => row.reduce((sum, value, offset) => sum + value * (offset + 1), variant - 3) >= 0 ? 1 : 0), lr: 0.08 + (index % 3) * 0.02, epochs: 45 + index % 35 };
        },
        solve: logisticGd,
    },
    {
        id: 'dbscan-density', title: 'One-Dimensional DBSCAN', difficulty: 'Hard', tags: ['clustering', 'density'],
        summary: 'Find density-connected clusters and noise.',
        description: 'Return DBSCAN cluster labels for payload.values in input order. Visit points in input order, number clusters from 0, and use -1 for noise.',
        constraints: ['2 <= len(values) <= 5000', 'min_samples includes the point itself.'],
        hints: ['Find epsilon-neighbours.', 'Expand from every core point.', 'Noise can later join a cluster.'],
        editorial: ['Use standard density reachability with deterministic visitation order.', 'O(n^2)', 'O(n)', ['Never relabeling reachable noise.', 'Excluding the point itself.']],
        make: (random, index, variant) => {
            const first = Array.from({ length: 4 + index % 4 }, () => variant + integer(random, -2, 2) * 0.3);
            const second = Array.from({ length: 4 + (index + 2) % 4 }, () => variant + 8 + integer(random, -2, 2) * 0.3);
            return { values: [...first, variant + 20, ...second], eps: 0.75, min_samples: 3 };
        },
        solve: dbscan1d,
    },
    {
        id: 'viterbi-decoding', title: 'Viterbi Sequence Decoding', difficulty: 'Hard', tags: ['sequence-models', 'dynamic-programming'],
        summary: 'Decode the most likely hidden-state path.',
        description: 'Return the most likely state-index path for the supplied HMM. Use log probabilities and prefer smaller previous-state indices on ties.',
        constraints: ['2 <= states <= 3', 'All probabilities are positive.', '1 <= len(observations) <= 1000.'],
        hints: ['Keep one score per ending state.', 'Store back-pointers.', 'Backtrack from the best final state.'],
        editorial: ['Dynamic programming retains the best path ending in each state.', 'O(T*S^2)', 'O(T*S)', ['Multiplication underflow.', 'Forgetting back-pointers.']],
        make: (random, index) => {
            const states = 2 + index % 2; const symbols = 3;
            const normalize = (row) => { const total = row.reduce((a, b) => a + b, 0); return row.map((value) => value / total); };
            const transition = Array.from({ length: states }, (_, state) => normalize(Array.from({ length: states }, (_, target) => (state === target ? 4 : 1) + random())));
            const emission = Array.from({ length: states }, (_, state) => normalize(Array.from({ length: symbols }, (_, symbol) => 1 + ((state + symbol) % states === 0 ? 3 : 0) + random())));
            return { observations: Array.from({ length: 6 + index % 8 }, () => integer(random, 0, symbols - 1)), start: normalize(Array.from({ length: states }, () => 1 + random())), transition, emission };
        },
        solve: viterbi,
    },
    {
        id: 'graph-pagerank', title: 'PageRank Iteration', difficulty: 'Hard', tags: ['graphs', 'ranking'],
        summary: 'Compute deterministic PageRank scores.',
        description: 'Start with uniform rank, run the requested iterations, distribute dangling-node mass uniformly, and return the rank vector.',
        constraints: ['2 <= nodes <= 1000', '0 < damping < 1', 'No duplicate outgoing edges.'],
        hints: ['Begin each node with teleport mass.', 'Split outgoing rank evenly.', 'Handle dangling nodes separately.'],
        editorial: ['Apply the PageRank power iteration including dangling redistribution.', 'O(iterations*(V+E))', 'O(V)', ['Losing dangling mass.', 'Updating ranks in place.']],
        make: (random, index) => {
            const size = 4 + index % 5;
            const adjacency = Array.from({ length: size }, (_, source) => Array.from({ length: size }, (_, target) => target)
                .filter((target) => target !== source && random() > 0.58));
            return { adjacency, damping: 0.85, iterations: 12 + index % 12 };
        },
        solve: pagerank,
    },
    {
        id: 'ranking-ndcg', title: 'NDCG at K', difficulty: 'Hard', tags: ['recommendation', 'ranking', 'metrics'],
        summary: 'Evaluate a ranked recommendation list.',
        description: 'Return NDCG@k using gain 2^relevance-1 and log2 discount. payload.ranking contains item indices; return 0 when ideal DCG is zero.',
        constraints: ['ranking is a permutation of item indices.', '0 <= relevance <= 4.'],
        hints: ['Compute DCG for the supplied ranking.', 'Sort relevance for ideal DCG.', 'Normalize safely.'],
        editorial: ['Compare discounted gain against the best possible ordering.', 'O(n log n)', 'O(n)', ['Using raw relevance as gain.', 'Discounting the first result.']],
        make: (random, index) => {
            const size = 7 + index % 9; const ranking = Array.from({ length: size }, (_, offset) => offset);
            for (let cursor = ranking.length - 1; cursor > 0; cursor -= 1) { const swap = integer(random, 0, cursor); [ranking[cursor], ranking[swap]] = [ranking[swap], ranking[cursor]]; }
            return { relevance: Array.from({ length: size }, () => integer(random, 0, 4)), ranking, k: 3 + index % (size - 2) };
        },
        solve: ndcg,
    },
];

function starterCode(template) {
    return `import json\nimport math\n\ndef solve(payload):\n    \"\"\"${template.summary}\"\"\"\n    # Write your implementation here.\n    raise NotImplementedError\n\nif __name__ == \"__main__\":\n    print(json.dumps(solve(json.loads(input())), separators=(\",\", \":\"), sort_keys=True))`;
}

function buildProblem(template, context, variant, templateIndex) {
    const count = template.difficulty === 'Easy' ? 8 : template.difficulty === 'Medium' ? 25 : 50;
    const tests = Array.from({ length: count }, (_, index) => {
        const random = rngFor((templateIndex + 1) * 100000 + variant * 1000 + index + 17);
        const payload = template.make(random, index, variant);
        return {
            input: JSON.stringify(rounded(payload)),
            expectedOutput: output(template.solve(payload)),
            isPublic: index < 2,
            timeLimit: template.difficulty === 'Hard' ? 5 : template.difficulty === 'Medium' ? 3 : 2,
            memoryLimit: 128000,
        };
    });
    const [approach, timeComplexity, spaceComplexity, pitfalls] = template.editorial;
    const slug = `${context.slug}-${template.id}`;
    return {
        contentVersion: 3,
        slug,
        title: `${context.label} ${template.title}`,
        difficulty: template.difficulty,
        tags: [...template.tags, context.tag, 'python'],
        summary: template.summary,
        description: `${template.description} This ${context.label.toLowerCase()} practice variant uses a deterministic JSON payload and a solve(payload) contract.`,
        constraints: template.constraints,
        starterCode: starterCode(template),
        sampleTestCases: tests.slice(0, 2).map((test) => ({ input: test.input, output: test.expectedOutput })),
        hints: template.hints,
        editorial: {
            summary: template.summary,
            approach,
            timeComplexity,
            spaceComplexity,
            pitfalls,
        },
        hiddenTestCount: count - 2,
        acceptanceRate: template.difficulty === 'Easy' ? 72 - variant : template.difficulty === 'Medium' ? 56 - variant : 38 - variant,
        category: template.tags[0].replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`),
        testcases: tests,
    };
}

function validate(catalog) {
    if (catalog.length < 100 || catalog.length > 200) throw new Error(`Expected 100-200 problems, got ${catalog.length}`);
    const slugs = new Set();
    const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0 };
    for (const problem of catalog) {
        if (slugs.has(problem.slug)) throw new Error(`Duplicate slug: ${problem.slug}`);
        slugs.add(problem.slug);
        difficultyCounts[problem.difficulty] += 1;
        const minimum = problem.difficulty === 'Easy' ? 5 : problem.difficulty === 'Medium' ? 20 : 40;
        const maximum = problem.difficulty === 'Easy' ? 10 : problem.difficulty === 'Medium' ? 30 : 80;
        if (problem.testcases.length < minimum || problem.testcases.length > maximum) {
            throw new Error(`${problem.slug} has ${problem.testcases.length} tests`);
        }
        if (!problem.title || !problem.summary || !problem.description || problem.hints.length < 2 || problem.constraints.length < 2) {
            throw new Error(`${problem.slug} is missing furnished problem content`);
        }
        if (problem.testcases.filter((test) => test.isPublic).length !== 2) {
            throw new Error(`${problem.slug} must expose exactly two examples`);
        }
        if (problem.hiddenTestCount !== problem.testcases.length - 2) {
            throw new Error(`${problem.slug} has inconsistent hiddenTestCount`);
        }
        if (new Set(problem.testcases.map((test) => test.input)).size !== problem.testcases.length) {
            throw new Error(`${problem.slug} contains duplicate testcase inputs`);
        }
        problem.testcases.forEach((test) => {
            JSON.parse(test.input); JSON.parse(test.expectedOutput);
        });
    }
    if (Object.values(difficultyCounts).some((count) => count < 30)) throw new Error('Catalog is not difficulty-balanced');
    return difficultyCounts;
}

const catalog = TEMPLATES.flatMap((template, templateIndex) => CONTEXTS.map(
    (context, variant) => buildProblem(template, context, variant, templateIndex)
));
const counts = validate(catalog);
if (require.main === module) {
    const outputs = process.argv.slice(2);
    if (outputs.length === 0) outputs.push(path.join(__dirname, '..', 'data', 'problem-catalog.json'));
    for (const target of outputs) {
        fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
        fs.writeFileSync(path.resolve(target), `${JSON.stringify(catalog, null, 2)}\n`);
    }
    console.log(`Generated ${catalog.length} problems`, counts, `to ${outputs.join(', ')}`);
}

module.exports = { TEMPLATES, CONTEXTS, catalog, validate };
